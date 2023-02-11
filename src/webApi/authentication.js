'use strict';
const QueryString = require('querystring');
const HttpClient = require('./httpclient.js');
const fs = require('fs');
const fsPromises = fs.promises;

class AUTHENTICATION {
    constructor(config) {
        this.httpClient = new HttpClient();
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.userToken = config.userToken;
        this.uhs = config.uhs;
        this.tokensFile = config.tokensFile;

        this.scopes = ['XboxLive.signin', 'XboxLive.offline_access'];
        this.endpoints = {
            live: 'https://login.live.com',
            auth: 'https://user.auth.xboxlive.com',
            xsts: 'https://xsts.auth.xboxlive.com'
        }

        this.user = {};
        this.tokens = {
            oauth: {},
            user: {},
            xsts: {}
        };
    }

    generateAuthorizationUrl() {
        return new Promise((resolve, reject) => {
            try {
                const paramsObject = {
                    "client_id": this.clientId,
                    "response_type": "code",
                    "approval_prompt": "auto",
                    "scope": this.scopes.join(' '),
                    "redirect_uri": `http://localhost:8581/auth/callback`
                }
                const params = QueryString.stringify(paramsObject);
                const oauth2URI = 'https://login.live.com/oauth20_authorize.srf?' + params;
                resolve(oauth2URI);
            } catch (error) {
                reject(error);
            };
        })
    }

    refreshTokens(type) {
        return new Promise(async (resolve, reject) => {
            if (type === undefined) {
                type = 'oauth';
            }

            switch (type) {
                case 'oauth':
                    if (this.tokens.oauth.refresh_token) {
                        try {
                            await this.refreshTokens('user');
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    } else {
                        reject('No oauth token found. Use authorization manager first.')
                    }
                    break;
                case 'user':
                    if (this.tokens.user.Token) {
                        try {
                            const userExpireUser = new Date(this.tokens.user.NotAfter).getTime();
                            if (new Date() > userExpireUser) {
                                const refreshToken = await this.refreshToken(this.tokens.oauth.refresh_token);
                                this.tokens.oauth = refreshToken;
                                await this.saveTokens(this.tokens);

                                const accessToken = await this.getUserToken(this.tokens.oauth.access_token);
                                this.tokens.user = accessToken;
                                this.tokens.xsts = {};
                                await this.saveTokens(this.tokens);

                                await this.refreshTokens('xsts');
                                resolve();
                            } else {
                                try {
                                    await this.refreshTokens('xsts');
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                };
                            }
                        } catch (error) {
                            reject(error);
                        };
                    } else {
                        try {
                            const accessToken = await this.getUserToken(this.tokens.oauth.access_token);
                            this.tokens.user = accessToken;
                            this.tokens.xsts = {};
                            await this.saveTokens(this.tokens);

                            await this.refreshTokens('xsts');
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    }
                    break;
                case 'xsts':
                    if (this.tokens.xsts.Token) {
                        try {
                            const oauthExpire = new Date(this.tokens.xsts.NotAfter).getTime();
                            if (new Date() > oauthExpire) {
                                this.tokens.xsts = {};
                                await this.saveTokens(this.tokens);

                                const userToken = await this.getXstsToken(this.tokens.user.Token);
                                this.tokens.xsts = userToken;
                                await this.saveTokens(this.tokens);

                                await this.refreshTokens('xsts');
                                resolve();
                            } else {
                                this.user = {
                                    gamertag: this.tokens.xsts.DisplayClaims.xui[0].gtg,
                                    xid: this.tokens.xsts.DisplayClaims.xui[0].xid,
                                    uhs: this.tokens.xsts.DisplayClaims.xui[0].uhs
                                    //agg: this.tokens.DisplayClaims.xui[0].agg,
                                    //usr: this.tokens.DisplayClaims.xui[0].usr,
                                    //utr: this.tokens.DisplayClaims.xui[0].utr,
                                    //prv: this.tokens.DisplayClaims.xui[0].prv
                                }
                                resolve();
                            }
                        } catch (error) {
                            reject(error);
                        };
                    } else {
                        try {
                            const userToken = await this.getXstsToken(this.tokens.user.Token);
                            this.tokens.xsts = userToken;
                            await this.saveTokens(this.tokens);

                            this.user = {
                                gamertag: userToken.DisplayClaims.xui[0].gtg,
                                xid: userToken.DisplayClaims.xui[0].xid,
                                uhs: userToken.DisplayClaims.xui[0].uhs
                                //agg: userToken.DisplayClaims.xui[0].agg,
                                //usr: userToken.DisplayClaims.xui[0].usr,
                                //utr: userToken.DisplayClaims.xui[0].utr,
                                //prv: userToken.DisplayClaims.xui[0].prv
                            }
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    }
                    break;
            }
        })
    }

    refreshToken(refreshToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "client_id": this.clientId,
                    "grant_type": "refresh_token",
                    "scope": this.scopes.join(' '),
                    "refresh_token": refreshToken,
                }

                if (this.clientSecret !== '') {
                    tokenParams.client_secret = this.clientSecret;
                }

                const postData = QueryString.stringify(tokenParams);
                const data = await this.httpClient.post(this.endpoints.live + '/oauth20_token.srf', { 'Content-Type': 'application/x-www-form-urlencoded' }, postData);
                const responseData = JSON.parse(data);
                responseData.issued = new Date().toISOString();
                resolve(responseData);
            } catch (error) {
                reject(error);
            };
        })
    }

    getUserToken(accessToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "RelyingParty": "http://auth.xboxlive.com",
                    "TokenType": "JWT",
                    "Properties": {
                        "AuthMethod": "RPS",
                        "SiteName": "user.auth.xboxlive.com",
                        "RpsTicket": "d=" + accessToken
                    },
                }

                const postData = JSON.stringify(tokenParams);
                const data = await this.httpClient.post(this.endpoints.auth + '/user/authenticate', { 'Content-Type': 'application/json' }, postData);
                const responseData = JSON.parse(data);
                resolve(responseData);
            } catch (error) {
                reject(error);
            };
        })
    }

    getXstsToken(userToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "RelyingParty": "http://xboxlive.com",
                    "TokenType": "JWT",
                    "Properties": {
                        "UserTokens": [userToken],
                        "SandboxId": "RETAIL",
                    },
                }

                const postData = JSON.stringify(tokenParams);
                const data = await this.httpClient.post(this.endpoints.xsts + '/xsts/authorize', { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' }, postData);
                const responseData = JSON.parse(data);
                resolve(responseData);
            } catch (error) {
                reject(error);
            };
        })
    }

    isAuthenticated() {
        return new Promise(async (resolve, reject) => {
            try {
                if (fs.existsSync(this.tokensFile) && fs.readFileSync(this.tokensFile).length > 30) {
                    const tokens = fs.readFileSync(this.tokensFile).toString();
                    this.tokens = JSON.parse(tokens);
                }

                if (this.clientId !== '') {
                    await this.refreshTokens();
                    resolve();
                } else if (this.userToken !== '' && this.uhs !== '') {
                    resolve();
                } else {
                    reject({ error: 'Client Id, user Token or Uhs missing!!!' });
                }
            } catch (error) {
                reject(error);
            };
        })
    }

    getTokenRequest(webApiToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const tokenParams = {
                    "client_id": this.clientId,
                    "grant_type": "authorization_code",
                    "scope": this.scopes.join(' '),
                    "code": webApiToken,
                    "redirect_uri": `http://localhost:8581/auth/callback`
                }

                if (this.clientSecret !== '') {
                    tokenParams.client_secret = this.clientSecret;
                }

                const postData = QueryString.stringify(tokenParams);
                const data = await this.httpClient.post(this.endpoints.live + '/oauth20_token.srf', { 'Content-Type': 'application/x-www-form-urlencoded' }, postData);
                const responseData = JSON.parse(data);
                responseData.issued = new Date().toISOString();
                this.tokens.oauth = responseData;
                await this.saveTokens(this.tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    saveTokens(tokens) {
        return new Promise(async (resolve, reject) => {
            try {
                tokens = JSON.stringify(tokens);
                await fsPromises.writeFile(this.tokensFile, tokens);
                await this.isAuthenticated();
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }
}
module.exports = AUTHENTICATION;