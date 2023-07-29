'use strict';
const UrlParser = require('url');
const Https = require('https');
const Http = require('http');

class HTTPCLIENT {
    constructor() { }

    request(method, url, headers, postdata) {
        return new Promise((resolve, reject) => {
            const parsedUrl = this.queryUrl(url);
            const options = {
                method: method,
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.path,
                headers: {}
            }

            for (const header in headers) {
                options.headers[header] = headers[header];
            }
            const addContentLength = method === 'POST' ? options.headers['Content-Length'] = postdata.length : false;

            const httpEngine = parsedUrl.protocol === 'https' ? Https : Http;
            const req = httpEngine.request(options, (res) => {
                let responseData = ''
                res.on('data', (data) => {
                    responseData += data;
                })
                res.on('close', () => {
                    if (res.statusCode != 200) {
                        reject(`status: ${res.statusCode}, body: ${responseData}`);
                        return;
                    };
                    resolve(responseData);
                })
            })
            const write = method === 'POST' ? req.write(postdata) : false;
            req.on('error', (error) => {
                reject(error);
            })
            req.end();
        })
    }

    queryUrl(url) {
        const parsedUrl = UrlParser.parse(url);
        const defaultPort = parsedUrl.protocol === 'https:' ? 443 : 80;
        const protocol = parsedUrl.protocol === 'https:' ? 'https' : 'http';

        return {
            hostname: parsedUrl.hostname,
            protocol: protocol,
            port: parsedUrl.port || defaultPort,
            path: parsedUrl.path
        }
    }
}
module.exports = HTTPCLIENT;