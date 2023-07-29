'use strict';
const QueryString = require('querystring')
const HttpClient = require('../httpclient.js');

class GAMECLIP {
    constructor(tokens, authorizationHeaders) {
        this.tokens = tokens;
        this.headers = authorizationHeaders;
        this.headers['x-xbl-contract-version'] = '1';
        this.httpClient = new HttpClient();
    }

    getUserGameclips() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://gameclipsmetadata.xboxlive.com/users/me/clips`;
                const response = await this.httpClient.request('GET', url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getCommunityGameclipsByTitleId(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://gameclipsmetadata.xboxlive.com/public/titles/${titleId}clips/saved?qualifier=created`;
                const response = await this.httpClient.request('GET', url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getGameclipsByXuid(titleId, skipItems, maxItems) {
        return new Promise(async (resolve, reject) => {
            try {
                const params = {
                    skipitems: skipItems || 0,
                    maxitems: maxItems || 25,
                }

                if (titleId !== undefined) {
                    params.titleid = titleId
                }

                const queryParams = QueryString.stringify(params)
                const url = `https://gameclipsmetadata.xboxlive.com/users/xuid(${this.tokens.xsts.DisplayClaims.xui[0].xid})/clips?${queryParams}`;
                const response = await this.httpClient.request('GET', url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = GAMECLIP;