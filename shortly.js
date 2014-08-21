var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

// switch with Promise.promisifyAll(requre('bcrypt-nodejs'))
Promise.promisifyAll(bcrypt);

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.get('/', 
function(req, res) {
  res.render('index');
});

app.get('/create', 
function(req, res) {
  res.render('index');
});

app.get('/links', 
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.get('/login',
function(req, res) {
  res.render('login');
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/links', 
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.post('/login',
function(req, res) {
  console.log(req.body);
  var username = req.body.username;
  var password = req.body.password;
  
  // Connect with the table "users"
  db.knex('users')
    // Get the user that matches the given username
    .where('username', '=', username)
    // select the 'salt' field
    .select('salt')
    .then(function(results){

      // if there is a salt in there,
      if (results.length) {
        // return the salt
        return results[0];
      } 

      // else tell client about failure
      res.end("User Does not exist"); 

    })
    .then(function(salt){
      // hash the salt and the password
      return bcrypt.hashAsync(password, salt, null);
    })
    .then(function(hash){
      // check the hash to the password in the database
      console.log('should be hash: ', hash);
    });

});

app.post('/signup',
function(req, res) {
  console.log(req.body);
  var username = req.body.username;
  var password = req.body.password;
  var dbsalt;
  // check users table for username
  db.knex('users')
    .where('username', '=', username)
    .select('username')
    .then(function(exists) {

      // if username doesn't exist
      if (!exists.length) {
        // generate salt, and pass it on
        return bcrypt.genSaltAsync(10);
      } else {
        // tell user of failure
        res.end("Please choose a new username.");
      }
    })
    .then(function(salt) {
      // generate and pass on hash of password and salt
      dbsalt = salt;
      return bcrypt.hashAsync(password, salt, null);
    })
    .then(function(hash){
      console.log('should be hash for new user: ', hash);
      console.log('should be salt for new user: ', dbsalt);
      
      // add new user to table, with username, hash, and salt
      new User({
        username: username,
        password: hash,
        salt: dbsalt
      })
      .save();
    });

});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
