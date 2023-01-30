'use strict';
const Https = require('https')
const Http = require('http')
const UrlParser = require('url')

class HTTPCLIENT {
    constructor() { }

    get(url, headers) {
        return new Promise((resolve, reject) => {
            // Extract options from url
            const parsedUrl = this.queryUrl(url)
            const options = {
                hostname: parsedUrl.host,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: 'GET',
                headers: {
                    // 'Content-Type': 'application/x-www-form-urlencoded',
                    // 'Content-Length': postdata.length
                },
            }

            for (let header in headers) {
                options.headers[header] = headers[header]
            }

            let httpEngine = Http
            if (parsedUrl.protocol == 'https') {
                httpEngine = Https
            }

            const req = httpEngine.request(options, (res) => {
                let responseData = ''
                res.on('data', (data) => {
                    responseData += data
                })

                res.on('close', () => {
                    if (res.statusCode == 200) {
                        resolve(responseData.toString())
                    } else {
                        reject({ status: res.statusCode, body: responseData.toString() })
                    }
                })
            })

            req.on('error', (error) => {
                reject(error)
            })

            req.end()

        })
    }

    post(url, headers, postdata) {
        return new Promise((resolve, reject) => {
            // Extract options from url
            const parsedUrl = this.queryUrl(url)
            const options = {
                hostname: parsedUrl.host,
                port: parsedUrl.port,
                path: parsedUrl.path,
                method: 'POST',
                headers: {
                    // 'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': postdata.length
                },
            }

            for (let header in headers) {
                options.headers[header] = headers[header]
            }

            let httpEngine = Http
            if (parsedUrl.protocol == 'https') {
                httpEngine = Https
            }

            const req = httpEngine.request(options, (res) => {
                let responseData = ''
                res.on('data', (data) => {
                    responseData += data
                })

                res.on('close', () => {
                    if (res.statusCode == 200) {
                        resolve(responseData.toString())
                    } else {
                        reject({ status: res.statusCode, body: responseData.toString() })
                    }
                })
            })

            req.on('error', (error) => {
                reject(error)
            })

            req.write(postdata)
            req.end()

        })
    }

    queryUrl(url) {
        const parsedUrl = UrlParser.parse(url)
        let defaultPort = 80
        let protocol = 'http'

        if (parsedUrl.protocol == 'https:') {
            defaultPort = 443
            protocol = 'https'
        }

        return {
            host: parsedUrl.hostname,
            protocol: protocol,
            port: parsedUrl.port || defaultPort,
            path: parsedUrl.path
        }
    }
}
module.exports = HTTPCLIENT;