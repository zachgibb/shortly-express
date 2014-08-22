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
var Session = require('express-session');
var cookieParser = require('cookie-parser');

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

app.use(cookieParser('supersecretstring'));
app.use(Session());

db.knex('users')
        .select('*')
        .then(function(results){
          console.log(results);
        });

var restrict = function(req, res, next) {
  console.log(req.session.user);
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access Denied';
    res.redirect('/login');
  }
};

app.get('/', restrict,
function(req, res) {
  res.render('index');
});

app.get('/create', restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.get('/login',
function(req, res) {
  res.render('login');
});

app.get('/logout',
function(req, res) {
  req.session.destroy();
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
  

  new User({username: username})
    .fetch()
    .then(function(model) {
      console.log("Model: ", model);
      if (model) {
        bcrypt.compareAsync(password, model.get('password')).then(function(exists){
          console.log('response from bcrypt: ', exists);
          if (exists) {
            req.session.regenerate(function() {
              req.session.user = model;
              res.redirect('/');
            });
          } else {
            res.end("Wrong password.");
          }
        });
      } else {
        res.end("User does not exist.");
      }
    });

});

app.post('/signup',
function(req, res) {
  console.log(req.body);
  var username = req.body.username;
  var password = req.body.password;
  var dbsalt;
  // check users table for username


  new User({
    username: username
  }).fetch()
    .then(function(model) {
      if (model) {
        res.end('Username already exists');
      } else {
        bcrypt.genSaltAsync(10)
          .then(function(salt){

            bcrypt.hashAsync(password, salt, null)
              .then(function(hash){

                new User({
                  username: username,
                  password: hash,
                  salt: salt
                }).save()
                  .then(function(usermodel){
                    req.session.regenerate(function(){
                      req.session.user = usermodel;
                      res.redirect('/');
                    });
                  });

              });

          });
      }
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
