var pg = require('pg'),
    db_config = process.env.DATABASE_URL || {user:'serious',database:'serious_beats',password:'beats'}
    client = new pg.Client(db_config);

client.connect();

var db = exports,
    sys = require("sys");

db.log = function(user, text, time, type, total_users) {
  client.query('INSERT INTO logs (name, text, type, time, total_users) values ($1, $2, $3, $4, $5)',
      [user, text, type, time, total_users], 
      function(error) {
        if (error)
          sys.puts("db error:" + error);
      });
};
