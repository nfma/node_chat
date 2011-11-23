var mysql = require('mysql'),
    DATABASE = 'serious_beats',
    client = mysql.createClient({user:'serious',password:'beats',host:'localhost',port:3306,database:'serious_beats'});

var db = exports,
    sys = require("sys");

db.log = function(user, text, time, type, total_users) {
  client.query('INSERT INTO logs values (NULL, ?, ?, ?, ?, ?)',
      [user, text, type, time, total_users], 
      function(error) {
        if (error)
          sys.puts("db error:" + error);
      });
};
