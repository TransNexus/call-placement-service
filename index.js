const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const ioredis = require('ioredis');

const config = require('./config.json');

const port = config.port || 8081;
const freshness = config.freshness || 60;
const stiVsUrl = config.stiVsUrl;
const stiVsTimeout = config.stiVsTimeout || 2 * 1000;
const redisConfig = config.redis || {};

if (!Number.isInteger(port)) {
  throw new Error('Config parameter "port" must be an integer');
}
if (port <= 0) {
  throw new Error('Config parameter "port" must be greater than 0');
}
if (port > 65535) {
  throw new Error('Config parameter "port" must be less than 65535');
}

if (!Number.isInteger(freshness)) {
  throw new Error('Config parameter "freshness" must be an integer');
}
if (freshness <= 0) {
  throw new Error('Config parameter "freshness" must be greater than 0');
}

if (typeof stiVsUrl === 'undefined') {
  throw new Error('Config parameter "stiVsUrl" must be specified');
}
if (typeof stiVsUrl !== 'string') {
  throw new Error('Config parameter "stiVsUrl" must be a string');
}

if (!Number.isInteger(stiVsTimeout)) {
  throw new Error('Config parameter "stiVsTimeout" must be an integer');
}
if (stiVsTimeout <= 0) {
  throw new Error('Config parameter "stiVsTimeout" must be greater than 0');
}

if (typeof redisConfig !== 'object') {
  throw new Error('Config parameter "redis" must be a number');
}

const redisClient = new ioredis(redisConfig);
redisClient.on('error', console.error);

const app = express();
app.use(bodyParser.text({
  type: 'application/passport',
}));

app.post('/[A-Z0-9]{4}/:destNumber([0-9]{7,15})/[A-Z0-9]{4}/:origNumber([0-9]{7,15})', async (req, res) => {
  try {
    const destNumber = req.params.destNumber;
    const origNumber = req.params.origNumber;

    if (typeof req.body !== 'string') {
      return res.status(400).send();
    }

    const now = Math.floor(Date.now() / 1000);

    let minIat = Infinity;

    const body = req.body.trim();
    const passports = body.split(/\r?\n/);

    for await (const passport of passports) {
      try {
        const encodedHeader = passport.split('.')[0];
        const header = JSON.parse(Buffer.from(encodedHeader, 'base64').toString('utf8'));
        const request = {
          verificationRequest: {
            orig: {
              tn: origNumber,
            },
            dest: {
              tn: [
                destNumber,
              ],
            },
            iat: now,
            identity: `${passport};info=<${header.x5u}>`,
          },
        };
        const response = await axios.post(stiVsUrl, request, {
          timeout: stiVsTimeout,
        });

        if (!response.data.verificationResponse) {
          return res.status(400).send();
        }
        if (response.data.verificationResponse.verstat !== 'TN-Validation-Passed') {
          return res.status(400).send();
        }

        const encodedPayload = passport.split('.')[1];
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
        const iat = payload.iat;
        if (iat < minIat) {
          minIat = iat;
        }
      } catch (err) {
        return res.status(400).send();
      }
    }

    const key = `orig:${origNumber}:dest:${destNumber}`;
    const exp = minIat + freshness - now;
    if (exp > 0) {
      await redisClient.setex(key, exp, body);
    }

    return res.status(201).send();
  } catch (err) {
    console.error(err);
    return res.status(500).send();
  }
});

app.post('*', (req, res) => {
  return res.status(404).send();
});

app.all('*', (req, res) => {
  return res.status(405).send();
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).send();
  } else {
    console.error(err);
    return res.status(500).send();
  }
});

redisClient.once('ready', () => {
  app.listen(port, () => {
    console.log(`Listening...`);
  });
});
