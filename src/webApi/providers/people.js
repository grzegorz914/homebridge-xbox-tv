'use strict';
const HttpClient = require('../httpclient.js');

class PEOPLE {
    constructor(authorizationHeaders) {
        this.headers = authorizationHeaders;
        this.headers['x-xbl-contract-version'] = '3';
        this.httpClient = new HttpClient();
    }

    getFriends() {
        return new Promise(async (resolve, reject) => {
            try {
                const params = [
                    'preferredcolor',
                    'detail',
                    'multiplayersummary',
                    'presencedetail',
                ]

                const url = `https://peoplehub.xboxlive.com/users/me/people/social/decoration/${params.join(',')}`;
                const response = await this.httpClient.request('GET', url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

    recentPlayers() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://peoplehub.xboxlive.com/users/me/people/recentplayers`;
                const response = await this.httpClient.request('GET', url, this.headers);
                resolve(response);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = PEOPLE;