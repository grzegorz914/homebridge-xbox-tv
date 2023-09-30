'use strict';
const axios = require('axios');

class PEOPLE {
    constructor(authorizationHeaders) {
        const headers = authorizationHeaders;
        headers['x-xbl-contract-version'] = '3';
        
        //create axios instance
        this.axiosInstance = axios.create({
            method: 'GET',
            headers: headers
        });
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
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

    recentPlayers() {
        return new Promise(async (resolve, reject) => {
            try {
                const url = `https://peoplehub.xboxlive.com/users/me/people/recentplayers`;
                const response = await this.axiosInstance(url);
                resolve(response.data);
            } catch (error) {
                reject(error);
            };
        });
    }

}
module.exports = PEOPLE;