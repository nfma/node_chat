HOST = null; // localhost
PORT = 8001;

var fu = require("./fu"),
    db = require("./db"),
    sys = require("sys"),
    url = require("url"),
    qs = require("querystring");

var MESSAGE_BACKLOG = 200,
    SESSION_TIMEOUT = 60 * 1000;

var util = {
  urlRE: /https?:\/\/([-\w\.]+)+(:\d+)?(\/([^\s]*(\?\S+)?)?)?/g, 

  //  html sanitizer 
  toStaticHTML: function(inputHtml) {
    inputHtml = inputHtml.toString();
    return inputHtml.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
  }
};

var size = 0;

var channel = new function () {
  var messages = [],
      callbacks = [];

  this.appendMessage = function (profile, type, text) {
    var m = { profile: profile
            , type: type // "rmsg", "msg", "join", "part"
            , text: text
            , timestamp: (new Date()).getTime()
            };

    switch (type) {
      case "msg":
        sys.puts("<" + profile.nick + "> " + text);
        break;
      case "rmsg":
        sys.puts("as <" + profile.nick + "> " + text);
        break;
      case "join":
        sys.puts(profile.nick + " join");
        break;
      case "part":
        sys.puts(profile.nick + " part");
        break;
    }

    messages.push( m );
    db.log(m.profile.nick, m.text, new Date(), m.type, size);

    while (callbacks.length > 0) {
      callbacks.shift().callback([m]);
    }

    while (messages.length > MESSAGE_BACKLOG)
      messages.shift();
  };

  this.query = function (since, callback) {
    var matching = [];
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.timestamp > since)
        matching.push(message)
    }

    if (matching.length != 0) {
      callback(matching);
    } else {
      callbacks.push({ timestamp: new Date(), callback: callback });
    }
  };

  // clear old callbacks
  // they can hang around for at most 30 seconds.
  setInterval(function () {
    var now = new Date();
    while (callbacks.length > 0 && now - callbacks[0].timestamp > 30*1000) {
      callbacks.shift().callback([]);
    }
  }, 3000);
};

var sessions = {};

function createSession (profile) {
  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.profile && session.profile.nick === profile.nick)
      return session;
  }

  var session = { 
    profile: profile, 
    id: profile.id, 
    timestamp: new Date(),

    poke: function () {
      session.timestamp = new Date();
    },

    destroy: function () {
      channel.appendMessage(session.profile, "part");
      size--;
      delete sessions[session.id];
    }
  };

  sessions[session.id] = session;
  size++;
  sys.puts("id:" + session.id);
  return session;
}

// interval to kill off old sessions
setInterval(function () {
  var now = new Date();
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];

    if (now - session.timestamp > SESSION_TIMEOUT) {
      session.destroy();
    }
  }
}, 1000);

fu.listen(Number(process.env.PORT || PORT), HOST);

fu.get("/", fu.staticHandler("index.html"));
fu.get("/style.css", fu.staticHandler("style.css"));
fu.get("/client.js", fu.staticHandler("client.js"));
fu.get("/jquery-1.2.6.min.js", fu.staticHandler("jquery-1.2.6.min.js"));

fu.get("/who", function (req, res) {
  var profiles = [];
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];
    profiles.push(session.profile);
  }
  res.simpleJSON(200, { profiles: profiles });
});

fu.get("/join", function (req, res) {
  var parsedQS = qs.parse(url.parse(req.url).query);
  var nick = decodeURIComponent(parsedQS.nick);
  var pic = parsedQS.pic;
  var id = parsedQS.id;
  var has_chatted = parsedQS.has_chatted;
  if (nick == null || nick.length == 0 || pic == null || pic.length == 0 || id == null || id.length == 0 || has_chatted == null || has_chatted.length == 0) {
    res.simpleJSON(400, {error: "You have to provide a valid nick, pick, has_chatted and id."});
    return;
  }
  var session = createSession({nick:nick,pic:pic,id:id,has_chatted:has_chatted});
  if (session == null) {
    res.simpleJSON(400, {error: "Nick in use"});
    return;
  }

  channel.appendMessage(session.profile, "join");
  res.simpleJSON(200, { id: session.id
                      , profile: session.profile
                      });
});

fu.get("/part", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.destroy();
  }
  res.simpleJSON(200, { });
});

fu.get("/recv", function (req, res) {
  if (!qs.parse(url.parse(req.url).query).since) {
    res.simpleJSON(400, { error: "Must supply since parameter" });
    return;
  }
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.poke();
  }

  var since = parseInt(qs.parse(url.parse(req.url).query).since, 10);

  channel.query(since, function (messages) {
    if (session) session.poke();
    res.simpleJSON(200, { messages: messages });
  });
});

fu.get("/send", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;

  var session = sessions[id];
  if (!session || !text) {
    res.simpleJSON(400, { error: "No such session id" });
    return;
  }

  session.poke();

  // sanitize
  text = util.toStaticHTML(text);

  // replace URLs with links
  text = text.replace(util.urlRE, '<a target="_blank" href="$&">$&</a>');

  channel.appendMessage(session.profile, "msg", text);
  res.simpleJSON(200, {});
});

fu.get("/rsend", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;

  var session = sessions[id];
  if (!session || !text) {
    res.simpleJSON(400, { error: "No such session id" });
    return;
  }

  session.poke();

  channel.appendMessage(session.profile, "rmsg", text);
  res.simpleJSON(200, {});
});
