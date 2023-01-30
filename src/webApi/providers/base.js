'use strict';
const HttpClient = require('../httpclient')

class BASE {
    constructor(client, providerName) {
        this.endpoint = 'https://xboxlive.com'
        this.providerName = providerName;
        this.headers = {
            'Authorization': (client.authentication.userToken !== '' && client.authentication.uhs !== '') ? 'XBL3.0 x=' + client.authentication.uhs + ';' + client.authentication.userToken : 'XBL3.0 x=' + client.authentication.user.uhs + ';' + client.authentication.tokens.xsts.Token,
            'Accept-Language': 'en-US',
            'x-xbl-contract-version': '2',
            'x-xbl-client-name': 'XboxApp',
            'x-xbl-client-type': 'UWA',
            'x-xbl-client-version': '39.39.22001.0'
        }
        this.httpClient = new HttpClient()
    }

    get(url) {
        return new Promise((resolve, reject) => {
            this.httpClient.get(this.endpoint + url, this.headers).then((response) => {
                const responseObject = JSON.parse(response)
                if (this.providerName == 'smartglass') {
                    if (responseObject.status.errorCode != 'OK') {
                        reject(responseObject.status)
                    } else {
                        resolve(responseObject)
                    }
                } else {
                    resolve(responseObject)
                }
            }).catch((error) => {
                reject(error)
            })
        })
    }

    post(url, postData) {
        return new Promise((resolve, reject) => {
            this.httpClient.post(this.endpoint + url, this.headers, postData).then((response) => {
                const responseObject = JSON.parse(response)
                if (this.providerName == 'smartglass') {
                    if (responseObject.status.errorCode != 'OK') {
                        reject(responseObject.status)
                    } else {
                        resolve(responseObject)
                    }
                } else {
                    resolve(responseObject)
                }
            }).catch((error) => {
                reject(error)
            })
        })
    }
}
module.exports = BASE;