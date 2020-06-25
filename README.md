# Call Placement Service

This application provides a simple web server that receives PASSporTs out-of-band and persists them to a Redis database. The application requires an STI-VS to verify the PASSporTs before they are persisted. Currently only the [ATIS-1000082](https://access.atis.org/apps/group_public/download.php/40781/ATIS-1000082.pdf) HTTP API is supported to communicate with an STI-VS.

## Config

The application requires a config file to function. The config file must be `./config.json`.

At a minimum, the config file must include `stiVsUrl`. Example:

```json
{
  "stiVsUrl": "http://127.0.0.1/stir/v1/verification",
}
```

The config file may include additional options. Example:

```json
{
  "port": 8081,
  "freshness": 60,
  "stiVsUrl": "http://127.0.0.1/stir/v1/verification",
  "stiVsTimeout": 2000
}
```
