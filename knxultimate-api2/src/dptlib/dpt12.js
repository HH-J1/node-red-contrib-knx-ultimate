/**
* (C) 2020 Supergiovane
*/

//
// DPT12.*:  4-byte unsigned value
//

const knxLog = require('./../KnxLog');



exports.formatAPDU = function(value) {
  if (!value || typeof value != 'number')
    knxLog.get().error('DPT12: Must supply a number value');
  var apdu_data = new Buffer.alloc(4);
  apdu_data.writeUIntBE(value,0,4);
  return apdu_data;
}

exports.fromBuffer = function(buf) {
  if (buf.length != 4) knxLog.get().warn("DPT12: Buffer should be 4 bytes long");
  return buf.readUIntBE(0, 4) ;
}

// DPT12 base type info
exports.basetype = {
  bitlength : 32,
  signedness: "unsigned",
  valuetype : "basic",
  desc : "4-byte unsigned value",
  "help": 
`// Send 4-byte unsigned value
msg.payload = 12;
return msg;`
}

// DPT12 subtype info
exports.subtypes = {
  // 12.001 counter pulses
  "001" : {
    "name" : "Counter pulses (unsigned)", "desc" : "counter pulses"
  },
  "1201" : {
    "name" : "Volume (m3)", "desc" : "Volume m3"
  }
}
