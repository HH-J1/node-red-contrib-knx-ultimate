/**
* knxultimate-api - a KNX protocol stack in pure Javascript based on knx.js (originally written by Elias Karakoulakis)
* (C) 2020-2022 Supergiovane
*/

const knxLog = require('./../KnxLog');

//
// DPT16: ASCII string (max 14 chars)
//

// Write to BUS
exports.formatAPDU = function(value) {
  if (typeof value != 'string') knxLog.get().warn("Must supply a string value")
  else {
    var buf = new Buffer.alloc(14);
    buf.write(value, 'ascii')
    return buf;
  }
}

// Read from BUS
exports.fromBuffer = function(buf) {
  return buf.toString('ascii');
 
}

// DPT16 basetype info
exports.basetype = {
  bitlength : 14*8,
  valuetype : 'basic',
  desc : "14-character string",
  "help": 
`// Send a text to a display
msg.payload = "Hello!"
return msg;`,
"helplink":""
}

// DPT9 subtypes
exports.subtypes = {
  // 16.000 ASCII string
  "000" : { use : "G",
    "desc" : "DPT_String_ASCII", "name" : "ASCII string",
    "force_encoding" : "US-ASCII"
  },

  // 16.001 ISO-8859-1 string
  "001" : { use : "G",
    "desc" : "DPT_String_8859_1", "name" : "ISO-8859-1 string",
    "force_encoding" : "ISO-8859-1"
  },
}
