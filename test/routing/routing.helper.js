const path = require('path');
const request = require('supertest');
const assert = require('chai').assert;
const logger = require('../../src/log').test
let gateway = require('../../src/gateway');


module.exports = function() {
  let app;
  return {
    setup: testSuite => done => {
      let actions = require('../../src/actions').init();
      testSuite.fakeActions.forEach((key) => {
        actions.register(key, (params) => {
          return (req, res) => {
            res.json({ result: key, params, hostname: req.hostname, url: req.url })
          }
        })
      })
      let options = {};
      if (testSuite.configPath) {
        options.configPath = path.join(__dirname, testSuite.configPath)
      } else {
        options.appConfig = testSuite.appConfig
      }
      gateway.start(options)
        .then(result => {
          app = result.app
          done()
        }).catch(done);
    },
    cleanup: () => done => {
      app.close();
      done()
    },
    validate404: testCase => {
      return (done) => {
        let testScenario = request(app);
        if (testCase.setup.postData) {
          testScenario = testScenario.post(testCase.setup.url, testCase.setup.postData);
        } else {
          testScenario = testScenario.get(testCase.setup.url);
        }

        if (testCase.setup.host) {
          testScenario.set('Host', testCase.setup.host)
        }
        testScenario.set('Content-Type', 'application/json')
          .expect(404)
          .expect('Content-Type', /text\/html/)
          .end(function(err, res) {
            if (err) { logger.error(res.body) }
            err ? done(err) : done();
          });
      }
    },
    validateSuccess: (testCase) => {
      return (done) => {
        let testScenario = request(app);

        if (testCase.setup.postData) {
          testScenario = testScenario.post(testCase.setup.url, testCase.setup.postData);
        } else {
          testScenario = testScenario.get(testCase.setup.url);
        }
        if (testCase.setup.host) {
          testScenario.set('Host', testCase.setup.host)
        }
        testScenario.set('Content-Type', 'application/json')
          .expect(200)
          .expect('Content-Type', /json/)
          .expect((res) => {
            assert.equal(res.body.result, testCase.test.result)
            assert.equal(res.body.url, testCase.test.url)
            if (testCase.test.host) {
              assert.equal(res.body.hostname, testCase.test.host)
            }
          })
          .end(function(err, res) {
            if (err) { logger.error(res.body) }
            err ? done(err) : done();
          });
      }
    }
  }
}