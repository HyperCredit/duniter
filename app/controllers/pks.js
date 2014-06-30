var fs       = require('fs');
var util     = require('util');
var async    = require('async');
var _        = require('underscore');
var stream   = require('stream');
var unix2dos = require('../lib/unix2dos');
var http2raw = require('../lib/streams/parsers/http2raw');
var jsoner   = require('../lib/streams/jsoner');
var parsers  = require('../lib/streams/parsers/doc');
var es       = require('event-stream');
var http400  = require('../lib/http/http400');
var logger   = require('../lib/logger')();

module.exports = function (pksServer) {
  return new PKSBinding(pksServer);
}

function PKSBinding (pksServer) {

  var conn = pksServer.conn;

  var MerkleService     = pksServer.MerkleService;
  var ParametersService = pksServer.ParametersService;
  var PeeringService    = pksServer.PeeringService;
  var PublicKeyService  = pksServer.PublicKeyService;
  var http              = pksServer.HTTPService;

  var PublicKey = conn.model('PublicKey');
  var Merkle    = conn.model('Merkle');

  this.getAll = function (req, res) {
    async.waterfall([
      function (next){
        Merkle.forPublicKeys(next);
      },
      function (merkle, next){
        MerkleService.processForURL(req, merkle, Merkle.mapForPublicKeys.bind(Merkle), next);
      }
    ], function (err, json) {
      if(err){
        res.send(400, err);
        return;
      }
      MerkleService.merkleDone(req, res, json);
    });
  };

  this.lookup = function (req, res) {
    var op = req.query.op;
    var pattern = req.query.search;
    if(pattern !== undefined){
      PublicKey.search(pattern, function (err, foundKeys) {
        switch(op){
          case 'get':
            var count = foundKeys.length;
            var armor = '';
            if(foundKeys.length > 0){
              count = 1;
              armor = foundKeys[0].raw;
            }
            res.render('../app/views/pks/lookup_get.ejs', {"armor": armor, "search": pattern, "nbKeys": foundKeys.length}, function (err, text) {
              res.writeHead(200, {"Content-type": "text/html"});
              res.end(text);
            });
            break;
          case 'index':
            var cleaned = [];
            foundKeys.forEach(function (k) {
              cleaned.push(k.json());
            });
            res.writeHead(200);
            res.end(JSON.stringify({"keys": cleaned}, null, "  "));
            break;
          default:
            res.send(501, 'Operation not supported.');
            break;
        }
      });
    }
    else{
      res.send(500, 'No interface yet.');
    }
  };

  this.add = function (req, res) {
    var onError = http400(res);
    http2raw.pubkey(req, onError)
      .pipe(unix2dos())
      .pipe(parsers.parsePubkey(onError))
      .pipe(pksServer.singleWriteStream(onError))
      .pipe(jsoner())
      .pipe(es.stringify())
      .pipe(res);
  };
};
