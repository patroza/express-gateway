'use strict';

const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const debug = require('debug')('gateway:config');
const morgan = require('morgan');

const MisconfigurationError = require('./errors').MisconfigurationError;
const processors = require('./processors');
const runConditional = require('./conditionals').run;

function loadConfig(fileName) {
  let config = readJsonFile(fileName);
  let app = express();

  attachStandardMiddleware(app);
  parseConfig(app, config);

  let server = undefined;
  if (config.tls) {
    server = https.createServer({
      key: fs.readFileSync(config.tls.key),
      cert: fs.readFileSync(config.tls.cert)
    }, app);
  } else {
    server = http.createServer(app);
  }

  return [server, config];
};

function parseConfig(app, config) {
  for (const pipeline of config.pipelines) {
    debug(`processing pipeline ${pipeline.name}`);

    let router = loadProcessors(pipeline.processors || [], config);
    attachToApp(app, router, pipeline.publicEndpoints || {});
  }
};

function readJsonFile(fileName) {
  if (fs.existsSync(fileName)) {
    try {
      return JSON.parse(fs.readFileSync(fileName));
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new MisconfigurationError(`Bad config file format: ${err}`);
      } else if ('errno' in err) {
        throw new MisconfigurationError(`Could not read config file: ${err}`);
      }
      throw err;
    }
  } else {
    throw new MisconfigurationError(`Could not find config file ${fileName}`);
  }
}

function attachStandardMiddleware(app) {
  morgan.token('target', (req, _res) => req.target ? req.target : '-');
  app.use(morgan(
    ':method (:target) :url :status :response-time ms - :res[content-length]'));
}

function loadProcessors(spec, config) {
  let router = express.Router();

  for (const procSpec of spec) {
    // TODO: compile all nested s-expressions in advance. This will allow
    // for better validation of the condition spec
    const condition = procSpec.condition || ['always'];
    const predicate = (req => runConditional(req, condition));
    const actionCtr = processors(procSpec.action);
    if (!actionCtr) {
      throw new MisconfigurationError(
        `Could not find action "${procSpec.action}"`);
    }
    const action = actionCtr(procSpec.params, config);

    router.use((req, res, next) => {
      debug(`checking predicate for ${procSpec.action}`);
      if (predicate(req)) {
        debug(`request matched predicate for ${procSpec.action}`);
        action(req, res, next);
      } else {
        next();
      }
    });
  }

  return router;
}

function attachToApp(app, router, publicEndpoints) {
  for (const ep of publicEndpoints) {
    app.use(ep.path, router);
  }
}

module.exports = {
  loadConfig,
  parseConfig,
  MisconfigurationError
};