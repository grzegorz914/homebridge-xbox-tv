'use strict';
const UrlParser = require('url');
const Https = require('https');
const Http = require('http');

class HTTPCLIENT {
    constructor() { }

    get(url, headers) {
        return new Promise((resolve, reject) => {
            const parsedUrl = this.queryUrl(url)
            const options = {
                hostname: parsedUrl.host,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: 'GET',
                headers: {}
            }

            for (const header in headers) {
                options.headers[header] = headers[header];
            }

            const httpEngine = parsedUrl.protocol === 'https' ? Https : Http;
            const req = httpEngine.request(options, (res) => {
                let responseData = ''
                res.on('data', (data) => {
                    responseData += data;
                }).on('close', () => {
                    if (res.statusCode === 200) {
                        resolve(responseData.toString());
                    } else {
                        reject({ status: res.statusCode, body: responseData.toString() });
                    }
                })
            })
            req.on('error', (error) => {
                reject(error);
            })
            req.end();

        })
    }

    post(url, headers, postdata) {
        return new Promise((resolve, reject) => {
            const parsedUrl = this.queryUrl(url);
            const options = {
                hostname: parsedUrl.host,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: 'POST',
                headers: {
                    'Content-Length': postdata.length
                }
            }

            for (const header in headers) {
                options.headers[header] = headers[header]
            }

            const httpEngine = parsedUrl.protocol === 'https' ? Https : Http;
            const req = httpEngine.request(options, (res) => {
                let responseData = ''
                res.on('data', (data) => {
                    responseData += data;
                })
                res.on('close', () => {
                    if (res.statusCode === 200) {
                        resolve(responseData.toString());
                    } else {
                        reject({ status: res.statusCode, body: responseData.toString() });
                    }
                })
            })
            req.on('error', (error) => {
                reject(error);
            })
            req.write(postdata);
            req.end();
        })
    }

    queryUrl(url) {
        const parsedUrl = UrlParser.parse(url)
        const defaultPort = parsedUrl.protocol === 'https:' ? 443 : 80;
        const protocol = parsedUrl.protocol === 'https:' ? 'https' : 'http';

        return {
            host: parsedUrl.hostname,
            protocol: protocol,
            port: parsedUrl.port || defaultPort,
            path: parsedUrl.path
        }
    }
}
module.exports = HTTPCLIENT;