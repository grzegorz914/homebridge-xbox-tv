'use strict';
const QueryString = require('querystring')
const HttpClient = require('../httpclient.js');

class CATALOG {
    constructor(client, headers) {
        this.client = client;
        this.headers = headers;
        this.httpClient = new HttpClient();
        this.headers['x-xbl-contract-version'] = '5'
    }

    getUserScreenshots() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://screenshotsmetadata.xboxlive.com/users/me/screenshot`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });

    }

    getCommunityScreenshotsByTitleId(titleId) {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://screenshotsmetadata.xboxlive.com/public/titles/${titleId}/screenshots?qualifier=created&maxItems=10`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    getScreenshotsByXuid(xuid, titleId, skipItems, maxItems) {
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
                const url = `https://screenshotsmetadata.xboxlive.com/users/xuid(${xuid})/screenshots?${queryParams}`;
                const response = await this.httpClient.get(url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = CATALOG;