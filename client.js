var CONFIG = { debug: false
             , profile: "#"   // set in onConnect
             , id: null    // set in onConnect
             , last_message_time: 1
             , focus: true //event listeners bound in onConnect
             , unread: 0 //updated in the message-processing loop
             , ping_timeout: 10 * 1000
             , ping: null
             };

var profiles = [];

//  CUT  ///////////////////////////////////////////////////////////////////
/* This license and copyright apply to all code until the next "CUT"
http://github.com/jherdman/javascript-relative-time-helpers/

The MIT License

Copyright (c) 2009 James F. Herdman

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


 * Returns a description of this past date in relative terms.
 * Takes an optional parameter (default: 0) setting the threshold in ms which
 * is considered "Just now".
 *
 * Examples, where new Date().toString() == "Mon Nov 23 2009 17:36:51 GMT-0500 (EST)":
 *
 * new Date().toRelativeTime()
 * --> 'Just now'
 *
 * new Date("Nov 21, 2009").toRelativeTime()
 * --> '2 days ago'
 *
 * // One second ago
 * new Date("Nov 23 2009 17:36:50 GMT-0500 (EST)").toRelativeTime()
 * --> '1 second ago'
 *
 * // One second ago, now setting a now_threshold to 5 seconds
 * new Date("Nov 23 2009 17:36:50 GMT-0500 (EST)").toRelativeTime(5000)
 * --> 'Just now'
 *
 */
Date.prototype.toRelativeTime = function(now_threshold) {
  var delta = new Date() - this;

  now_threshold = parseInt(now_threshold, 10);

  if (isNaN(now_threshold)) {
    now_threshold = 0;
  }

  if (delta <= now_threshold) {
    return 'Just now';
  }

  var units = null;
  var conversions = {
    millisecond: 1, // ms    -> ms
    second: 1000,   // ms    -> sec
    minute: 60,     // sec   -> min
    hour:   60,     // min   -> hour
    day:    24,     // hour  -> day
    month:  30,     // day   -> month (roughly)
    year:   12      // month -> year
  };

  for (var key in conversions) {
    if (delta < conversions[key]) {
      break;
    } else {
      units = key; // keeps track of the selected key over the iteration
      delta = delta / conversions[key];
    }
  }

  // pluralize a unit when the difference is greater than 1.
  delta = Math.floor(delta);
  if (delta !== 1) { units += "s"; }
  return [delta, units].join(" ") + " ago";
};

/*
 * Wraps up a common pattern used with this plugin whereby you take a String
 * representation of a Date, and want back a date object.
 */
Date.fromString = function(str) {
  return new Date(Date.parse(str));
};

//  CUT  ///////////////////////////////////////////////////////////////////



//updates the users link to reflect the number of active users
function updateUsersLink ( ) {
  var t = profiles.length.toString() + " DJ";
  if (profiles.length != 1)
    t += "s";
  t += " online";
  $("#usersLink").text(t);
}

//handles another person joining chat
function userJoin(profile, timestamp) {
  //if we already know about this user, ignore it
  for (var i = 0; i < profiles.length; i++)
    if (profiles[i].nick == profile.nick) 
      return;
  //otherwise, add the user to the list
  profiles.push(profile);
  //update the UI
  updateUsersLink();
  //tell others
  addMessage(profile, "joined", timestamp, "join");
}

//handles someone leaving
function userPart(profile, timestamp) {
  //remove the user from the list
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i] == profile) {
      profiles.splice(i,1)
      break;
    }
  }
  //update the UI
  updateUsersLink();
  //put it in the stream
  addMessage(profile, "left", timestamp, "part");
}

//handles pings
function rcvPing(profile, timestamp) {
  addMessage(profile, "ping", timestamp, "ping");
}

// utility functions

util = {
  //  html sanitizer 
  toStaticHTML: function(inputHtml) {
    inputHtml = inputHtml.toString();
    return inputHtml.replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
  }, 

  //pads n with zeros on the left,
  //digits is minimum length of output
  //zeroPad(3, 5); returns "005"
  //zeroPad(2, 500); returns "500"
  zeroPad: function (digits, n) {
    n = n.toString();
    while (n.length < digits) 
      n = '0' + n;
    return n;
  },

  //it is almost 8 o'clock PM here
  //timeString(new Date); returns "19:49"
  timeString: function (date) {
    var minutes = date.getMinutes().toString();
    var hours = date.getHours().toString();
    return this.zeroPad(2, hours) + ":" + this.zeroPad(2, minutes);
  },

  //does the argument only contain whitespace?
  isBlank: function(text) {
    var blank = /^\s*$/;
    return (text.match(blank) !== null);
  },

  parseUrlParameters: function(url) { 
    var result = {}; 
    var parameters = /https?:\/\/[-\w\.]+(:\d+)?(\/[^\s?]*(\?(\S+))?)?/g.exec(url)[4].split("&"); 
    for (k in parameters) { 
      var kva = parameters[k].split("="); 
      result[kva[0]] = kva[1];
    } 
    return result;
  }
};

//used to keep the most recent messages visible
//might be broken at the moment
function scrollDown () {
  window.scrollBy(0, 100000000000000000);
  $("#entry").focus();
}

//inserts an event into the stream for display
//the event may be a msg, join or part type
//from is the user, text is the body and time is the timestamp, defaulting to now
//_class is a css class to apply to the message, usefull for system events
function addMessage (from, text, time, _class) {
  if (text === null)
    return;

  if (time == null) {
    // if the time is null or undefined, use the current time.
    time = new Date();
  } else if ((time instanceof Date) === false) {
    // if it's a timestamp, interpret it
    time = new Date(time);
  }

  //every message you see is actually a div with paragraphs which include:
  //  the picture,
  //  the person who caused the event,
  //  the content
  //  and the time
  
  var messageElement = $(document.createElement("div"));

  messageElement.addClass("feed_post");
  if (_class)
    messageElement.addClass(_class);

  // If the current user said this, add a special css class
  var nick_re = new RegExp(CONFIG.profile.nick);
  if (nick_re.exec(text))
    messageElement.addClass("personal");

  var content = '<p class="thumb"><img src="' + util.toStaticHTML(from.pic) + '"></p>'
              + '<p class="feed_text"><span class="name"><a href="javascript:goTo(\'/users/' + from.id + '\');">' + util.toStaticHTML(from.nick) + '</a></span><span class="colon">: </span>'
              + text + ' <span class="smaller">' + util.timeString(time) + '</span></p>';

  messageElement.html(content);

  //the feed_scroll is the stream that we view
  $(".jspPane").prepend(messageElement);
  $('.scroll').jScrollPane(
    {
      verticalDragMinHeight: 20,
      verticalDragMaxHeight: 100
    }
  );
}

var transmission_errors = 0;
var first_poll = true;


//process updates if we have any, request updates from the server,
// and call again with response. the last part is like recursion except the call
// is being made from the response handler, and not at some point during the
// function's execution.
function longPoll (data) {
  if (transmission_errors > 2) {
    window.location.reload();
    return;
  }

  //process any updates we may have
  //data will be null on the first call of longPoll
  if (data && data.messages) {
    data.messages.forEach(function(message) {
      //track oldest message so we only request newer messages from server
      if (message.timestamp > CONFIG.last_message_time)
        CONFIG.last_message_time = message.timestamp;

      //dispatch new messages to their appropriate handlers
      switch (message.type) {
        case "msg":
         if(!CONFIG.focus){
            CONFIG.unread++;
          }
          addMessage(message.profile, message.text, message.timestamp);
          break;
        case "rmsg":
          if(!CONFIG.focus){
            CONFIG.unread++;
          }
          addMessage(message.profile, message.text, message.timestamp, "activity");
          break;

        case "join":
          //userJoin(message.profile, message.timestamp);
          break;

        case "part":
          //userPart(message.profile, message.timestamp);
          break;

        case "ping":
          rcvPing(message.profile, message.timestamp);
          break;

        case "picture":
          updatePicture(message.profile);
          break;
      }
    });

    //update the document title to include unread message count if blurred
    updateTitle();

    //update profiles
    who();
  }

  //make another request
  $.ajax({ cache: false
         , type: "GET"
         , url: "/recv"
         , dataType: "json"
         , data: { since: CONFIG.last_message_time, id: CONFIG.id }
         , error: function () {
             transmission_errors += 1;
             //don't flood the servers on error, wait 10 seconds before retrying
             setTimeout(longPoll, 10*1000);
           }
         , success: function (data) {
             transmission_errors = 0;
             clearTimeout(ping);
             //if everything went well, begin another request immediately
             //the server will take a long time to respond
             //how long? well, it will wait until there is another message
             //and then it will return it to us and close the connection.
             //since the connection is closed when we get data, we longPoll again
             longPoll(data);
           }
         });
  
  //send a ping if we don't get a response within CONFIG.ping_timeout
  ping = setTimeout(sendPing, CONFIG.ping_timeout);
}

//submit a new message to the server
function send(msg) {
  jQuery.get("/send", {id: CONFIG.id, text: msg}, function (data) { }, "json");
}

//submit a ping to the server
function sendPing() {
  jQuery.get("/ping", {id: CONFIG.id}, function (data) {}, "json");
}

//transition the page to the loading screen
function showLoad () {
  $("#loading").show();
  $("#toolbar").hide();
}

function updatePicture (profile) {
  // somehow this gets into an infinite loop without this test
  if(CONFIG.profile.id == profile.id && CONFIG.profile.pic != profile.pic) {
    CONFIG.profile.pic = profile.pic;
    window.location.href = window.location.href.replace(/pic=[^&]+/, 'pic=' + profile.pic);
  }
}

//transition the page to the main chat view, putting the cursor in the textfield
function showChat (profile) {
  $("#toolbar").show();
  $("#entry").focus();
  $("#loading").hide();

  //scrollDown();
}

//we want to show a count of unread messages when the window does not have focus
function updateTitle(){
  if (CONFIG.unread) {
    document.title = "(" + CONFIG.unread.toString() + ") node chat";
  } else {
    document.title = "node chat";
  }
}

//handle the server's response to our nickname and join request
function onConnect (session) {
  if (session.error) {
    alert("error connecting: " + session.error);
    return;
  }

  CONFIG.profile = session.profile;
  CONFIG.id      = session.id;

  //update the UI to show the chat
  showChat(CONFIG.profile);

  //listen for browser events so we know to update the document title
  $(window).bind("blur", function() {
    CONFIG.focus = false;
    updateTitle();
  });

  $(window).bind("focus", function() {
    CONFIG.focus = true;
    CONFIG.unread = 0;
    updateTitle();
  });
  
  //show user thumb
  $('#user_thumb').html('<img src="' + CONFIG.profile.pic + '" />');
  
}

//add a list of present chat members to the stream
function outputUsers () {
  var users = profiles.map(function(profile) {
    return '<a href="javascript:goTo(\'/users/' + profile.id + '\');">' + profile.nick + '<a>';
  }).join(", ");
  users = "online: " + users;
  addMessage({nick:"",pic:"#"}, users, new Date(), "activity");
  return false;
}

//get a list of the users presently in the room, and add it to the stream
function who () {
  jQuery.get("/who", {}, function (data, status) {
    if (status != "success") return;
    profiles = data.profiles;
    updateUsersLink();
  }, "json");
}

function connect() {
  showLoad();

  var params = util.parseUrlParameters(window.location);
  if (params.nick && params.pic && params.id && params.has_chatted) {
    //make the actual join request to the server
    $.ajax({ cache: false
           , type: "GET" // XXX should be POST
           , dataType: "json"
           , url: "/join"
           , data: {nick:params.nick,pic:params.pic,id:params.id,has_chatted:params.has_chatted}
           , error: function () {
               alert("error connecting to server");
             }
           , success: onConnect
           });
  }
  // output the online users nicks when clicking on the number of users
  $("#usersLink").click(outputUsers);
  return false;
}

function postMsg() {
  var msg = $("#entry").val().replace("\n", "");
  if (!util.isBlank(msg)) send(msg);
  $("#entry").val(''); // clear the entry field.
}

function userUsedChat() {
  // tell the top app that the user used the chat
  if (CONFIG.profile.has_chatted == "false") {
    CONFIG.profile.has_chatted = "true";
    $.postMessage("chat used", appUrl(), parent);
  }
}

$(document).ready(function() {

  //submit new messages when the user hits enter if the message isnt blank
  $("#entry").keypress(function (e) {
    if (e.keyCode != 13 /* Return */) return;
    postMsg();
    userUsedChat();
  });

  $('#post').click(function () {
    postMsg();
    userUsedChat()
  });

  updateUsersLink();

  if (CONFIG.debug) {
    $("#loading").hide();
    //scrollDown();
    return;
  }

  connect();
  
  
  //begin listening for updates right away
  //interestingly, we don't need to join a room to get its updates
  //we just don't show the chat stream to the user until we create a session
  longPoll();
});

//if we can, notify the server that we're going away.
$(window).unload(function () {
  jQuery.get("/part", {id: CONFIG.id}, function (data) { }, "json");
});

function goTo(url) {
  $.postMessage(url, appUrl(), parent);
};

function appUrl() {
  app = window.location.href;
  return app.search('localhost') == - 1 ? 'https://www.your-turn.fm/' : 'http://localhost:3000/';
}
