var mysql = require('mysql'),
    DATABASE = 'serious_beats',
    client = mysql.createClient({user:'serious',pass:'beats',host:'localhost',port:3306,database:'serious_beats'});

var db = exports,
    sys = require("sys");

db.log = function(user, text, time, type) {
  client.query('INSERT INTO logs values (NULL, ?, ?, ?, ?)',
      [user, text, type, time], 
      function(error) {
        sys.puts("db error" + error);
      });
};
