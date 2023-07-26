'use strict';
const HttpClient = require('../httpclient.js');

class MESSAGES {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        this.headers = authorizationHeaders;
        this.httpClient = new HttpClient();
    }

    getInbox() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://xblmessaging.xboxlive.com/network/Xbox/users/me/inbox`;
                const response = await this.httpClient.request(url, this.headers, undefined, 'GET');
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });

    }

    getConversation() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://xblmessaging.xboxlive.com/network/Xbox/users/me/conversations/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})?maxItems=100`;
                const response = await this.httpClient.request(url, this.headers, undefined, 'GET');
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = MESSAGES;