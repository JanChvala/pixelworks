/* eslint-env mocha */
var assert = require('chai').assert;
var sinon = require('sinon');

var Processor = require('../../lib/processor');

describe('Processor', function() {

  var identity = function(inputs) {
    return inputs;
  };

  describe('constructor', function() {
    it('creates a new processor', function() {
      var processor = new Processor({
        operations: [identity]
      });

      assert.instanceOf(processor, Processor);
    });
  });

  describe('#process()', function() {

    it('calls operations with input pixels', function(done) {

      var processor = new Processor({
        operations: [function(inputs, meta) {
          ++meta.count;
          var pixel = inputs[0];
          for (var i = 0, ii = pixel.length; i < ii; ++i) {
            meta.sum += pixel[i];
          }
          return inputs;
        }]
      });

      var array = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
      var input = new ImageData(array, 1, 2);

      processor.process([input], {count: 0, sum: 0}, function(err, output, m) {
        if (err) {
          done(err);
          return;
        }
        assert.equal(m.count, 2);
        assert.equal(m.sum, 36);
        done();
      });

    });

    it('calls callback with processed image data', function(done) {

      var processor = new Processor({
        operations: [function(inputs) {
          var pixel = inputs[0];
          pixel[0] *= 2;
          pixel[1] *= 2;
          pixel[2] *= 2;
          pixel[3] *= 2;
          return inputs;
        }]
      });

      var array = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
      var input = new ImageData(array, 1, 2);

      processor.process([input], {}, function(err, output, m) {
        if (err) {
          done(err);
          return;
        }
        assert.instanceOf(output, ImageData);
        assert.deepEqual(output.data,
            new Uint8ClampedArray([2, 4, 6, 8, 10, 12, 14, 16]));
        done();
      });

    });

    it('allows library functions to be called', function(done) {
      var lib = {
        sum: function(a, b) {
          return a + b;
        },
        diff: function(a, b) {
          return a - b;
        }
      };

      var normalizedDiff = function(pixels) {
        var pixel = pixels[0];
        var r = pixel[0];
        var g = pixel[1];
        /* eslint-disable */
        var nd = diff(r, g) / sum(r, g);
        /* eslint-enable */
        var index = Math.round(255 * (nd + 1) / 2);
        return [[index, index, index, pixel[3]]];
      };

      var processor = new Processor({
        operations: [normalizedDiff],
        lib: lib
      });

      var array = new Uint8ClampedArray([10, 2, 0, 0, 5, 8, 0, 1]);
      var input = new ImageData(array, 1, 2);

      processor.process([input], {}, function(err, output, m) {
        if (err) {
          done(err);
          return;
        }
        assert.instanceOf(output, ImageData);
        var v0 = Math.round(255 * (1 + 8 / 12) / 2);
        var v1 = Math.round(255 * (1 + -3 / 13) / 2);
        assert.deepEqual(output.data,
            new Uint8ClampedArray([
              v0, v0, v0, 0,
              v1, v1, v1, 1]));

        done();
      });
    });


    it('calls callbacks for each call', function(done) {
      var processor = new Processor({
        operations: [identity]
      });

      var calls = 0;

      function createCallback(index) {
        return function(err, output, meta) {
          if (err) {
            done(err);
            return;
          }
          assert.instanceOf(output, ImageData);
          ++calls;
        };
      }

      for (var i = 0; i < 5; ++i) {
        var input = new ImageData(new Uint8ClampedArray([1, 2, 3, 4]), 1, 1);
        processor.process([input], {}, createCallback(i));
      }

      setTimeout(function() {
        assert.equal(calls, 5);
        done();
      }, 1000);
    });

    it('respects max queue length', function(done) {
      var processor = new Processor({
        queue: 1,
        operations: [identity]
      });

      var log = [];

      function createCallback(index) {
        return function(err, output, meta) {
          if (err) {
            done(err);
            return;
          }
          log.push(output);
        };
      }

      for (var i = 0; i < 5; ++i) {
        var input = new ImageData(new Uint8ClampedArray([1, 2, 3, 4]), 1, 1);
        processor.process([input], {}, createCallback(i));
      }

      setTimeout(function() {
        assert.lengthOf(log, 5);
        assert.isNull(log[0], 'first call null');
        assert.isNull(log[1], 'second call null');
        assert.isNull(log[2], 'third call null');
        assert.instanceOf(log[3], ImageData);
        assert.instanceOf(log[4], ImageData);
        done();
      }, 1000);
    });

  });

  describe('#process() - faux worker', function() {

    var identitySpy;
    beforeEach(function() {
      identitySpy = sinon.spy(identity);
    });

    it('calls operations with input pixels', function(done) {
      var processor = new Processor({
        threads: 0,
        operations: [identitySpy]
      });

      var array = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
      var input = new ImageData(array, 1, 2);

      processor.process([input], {}, function(err, output, m) {
        if (err) {
          done(err);
          return;
        }
        assert.equal(identitySpy.callCount, 2);
        var first = identitySpy.getCall(0);
        assert.lengthOf(first.args, 2);
        done();
      });

    });

    it('passes meta object to operations', function(done) {
      var processor = new Processor({
        threads: 0,
        operations: [identitySpy]
      });

      var array = new Uint8ClampedArray([1, 2, 3, 4]);
      var input = new ImageData(array, 1, 1);
      var meta = {foo: 'bar'};

      processor.process([input], meta, function(err, output, m) {
        if (err) {
          done(err);
          return;
        }
        assert.deepEqual(m, meta);
        assert.equal(identitySpy.callCount, 1);
        done();
      });

    });

  });

  describe('#destroy()', function() {

    it('stops callbacks from being called', function(done) {

      var processor = new Processor({
        operations: [identity]
      });

      var array = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
      var input = new ImageData(array, 1, 2);

      processor.process([input], {}, function() {
        done(new Error('Expected abort to stop callback from being called'));
      });

      processor.destroy();
      setTimeout(done, 500);

    });

  });

  describe('#destroy() - faux worker', function() {

    it('stops callbacks from being called', function(done) {

      var processor = new Processor({
        threads: 0,
        operations: [identity]
      });

      var array = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8]);
      var input = new ImageData(array, 1, 2);

      processor.process([input], {}, function() {
        done(new Error('Expected abort to stop callback from being called'));
      });

      processor.destroy();
      setTimeout(done, 20);

    });

  });

});
