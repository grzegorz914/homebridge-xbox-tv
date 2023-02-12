'use strict';
const HttpClient = require('../httpclient.js');

class MESSAGES {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
    }

    getInbox() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://xblmessaging.xboxlive.com/network/Xbox/users/me/inbox`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });

    }

    getConversation(xuid) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://xblmessaging.xboxlive.com/network/Xbox/users/me/conversations/users/xuid(${xuid})?maxItems=100`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = MESSAGES;