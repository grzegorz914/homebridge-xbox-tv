'use strict';
const QueryString = require('querystring');
const fs = require('fs');
const fsPromises = fs.promises;
const HttpClient = require('./httpclient.js');
const CONSTANS = require('../constans.json');

class AUTHENTICATION {
    constructor(config) {
        this.httpClient = new HttpClient();
        this.xboxLiveUser = config.xboxLiveUser;
        this.xboxLivePasswd = config.xboxLivePasswd;
        this.clientId = config.clientId || CONSTANS.ClientId;
        this.clientSecret = config.clientSecret;
        this.userToken = config.userToken;
        this.userHash = config.userHash;
        this.tokensFile = config.tokensFile;

        this.user = {
            gtg: {},
            xid: {},
            uhs: {},
            agg: {},
            usr: {},
            utr: {},
            prv: {}
        };
        this.tokens = {
            oauth: {},
            user: {},
            xsts: {}
        };
    }

    refreshTokens(type) {
        return new Promise(async (resolve, reject) => {
            switch (type) {
                case 'user':
                    if (this.tokens.user.Token) {
                        const tokenExpired = new Date() > new Date(this.tokens.user.NotAfter).getTime();
                        switch (tokenExpired) {
                            case true:
                                try {
                                    await this.refreshToken(this.tokens.oauth.refresh_token);
                                    await this.getUserToken(this.tokens.oauth.access_token);
                                    await this.refreshTokens('xsts');
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                };
                                break;
                            case false:
                                try {
                                    await this.refreshTokens('xsts');
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                };
                                break;
                        }
                    } else {
                        try {
                            await this.getUserToken(this.tokens.oauth.access_token);
                            await this.refreshTokens('xsts');
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    }
                    break;
                case 'xsts':
                    if (this.tokens.xsts.Token) {
                        const tokenExpired = new Date() > new Date(this.tokens.xsts.NotAfter).getTime();
                        switch (tokenExpired) {
                            case true:
                                try {
                                    await this.getXstsToken(this.tokens.user.Token);
                                    await this.refreshTokens('xsts');
                                    resolve();
                                } catch (error) {
                                    reject(error);
                                };
                                break;
                            case false:
                                this.user.gtg = this.tokens.xsts.DisplayClaims.xui[0].gtg;
                                this.user.xid = this.tokens.xsts.DisplayClaims.xui[0].xid;
                                this.user.uhs = this.tokens.xsts.DisplayClaims.xui[0].uhs;
                                this.user.agg = this.tokens.xsts.DisplayClaims.xui[0].agg;
                                this.user.usr = this.tokens.xsts.DisplayClaims.xui[0].usr;
                                this.user.utr = this.tokens.xsts.DisplayClaims.xui[0].utr;
                                this.user.prv = this.tokens.xsts.DisplayClaims.xui[0].prv;
                                resolve();
                                break;
                        }
                    } else {
                        try {
                            const xstsToken = await this.getXstsToken(this.tokens.user.Token);
                            this.user.gtg = xstsToken.DisplayClaims.xui[0].gtg;
                            this.user.xid = xstsToken.DisplayClaims.xui[0].xid;
                            this.user.uhs = xstsToken.DisplayClaims.xui[0].uhs;
                            this.user.agg = xstsToken.DisplayClaims.xui[0].agg;
                            this.user.usr = xstsToken.DisplayClaims.xui[0].usr;
                            this.user.utr = xstsToken.DisplayClaims.xui[0].utr;
                            this.user.prv = xstsToken.DisplayClaims.xui[0].prv;
                            resolve();
                        } catch (error) {
                            reject(error);
                        };
                    }
                    break;
            }
        })
    }

    accessToken(webApiToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "grant_type": 'authorization_code',
                    "scope": CONSTANS.Scopes,
                    "code": webApiToken,
                    "redirect_uri": CONSTANS.Url.Redirect
                }
                const addClientSecret = this.clientSecret ? payload.client_secret = this.clientSecret : false;

                const postData = QueryString.stringify(payload);
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(CONSTANS.Url.AccessToken, headers, postData);
                const accessToken = JSON.parse(data);
                accessToken.issued = new Date().toISOString();
                this.tokens.oauth = accessToken;
                await this.saveTokens(this.tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    refreshToken(token) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "grant_type": "refresh_token",
                    "scope": CONSTANS.Scopes,
                    "refresh_token": token,
                }
                const addClientSecret = this.clientSecret ? payload.client_secret = this.clientSecret : false;

                const postData = QueryString.stringify(payload);
                const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                const data = await this.httpClient.post(CONSTANS.Url.RefreshToken, headers, postData);
                const refreshToken = JSON.parse(data);
                refreshToken.issued = new Date().toISOString();
                this.tokens.oauth = refreshToken;
                await this.saveTokens(this.tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    getUserToken(accessToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "RelyingParty": 'http://auth.xboxlive.com',
                    "TokenType": 'JWT',
                    "Properties": {
                        "AuthMethod": 'RPS',
                        "SiteName": 'user.auth.xboxlive.com',
                        "RpsTicket": `d=${accessToken}`
                    },
                }

                const postData = JSON.stringify(payload);
                const headers = { 'Content-Type': 'application/json' };
                const data = await this.httpClient.post(CONSTANS.Url.UserToken, headers, postData);
                const userToken = JSON.parse(data);
                this.tokens.user = userToken;
                this.tokens.xsts = {};
                await this.saveTokens(this.tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    getXstsToken(userToken) {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "RelyingParty": 'http://xboxlive.com',
                    "TokenType": 'JWT',
                    "Properties": {
                        "UserTokens": [userToken],
                        "SandboxId": 'RETAIL',
                    },
                }

                const postData = JSON.stringify(payload);
                const headers = { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' };
                const data = await this.httpClient.post(CONSTANS.Url.XstsToken, headers, postData);
                const xstsToken = JSON.parse(data);
                this.tokens.xsts = xstsToken;
                await this.saveTokens(this.tokens);
                resolve(xstsToken);
            } catch (error) {
                reject(error);
            };
        })
    }

    checkAuthorization() {
        return new Promise(async (resolve, reject) => {
            if (fs.existsSync(this.tokensFile) && fs.readFileSync(this.tokensFile).length > 30) {
                const tokens = fs.readFileSync(this.tokensFile);
                this.tokens = JSON.parse(tokens);
            }

            if (this.clientId) {
                if (!this.tokens.oauth.refresh_token) {
                    reject('No oauth token found. Use authorization manager first.')
                };

                try {
                    await this.refreshTokens('user');
                    resolve();
                } catch (error) {
                    reject(error);
                };
            } else if (this.userToken && this.userHash) {
                resolve();
            } else {
                reject('Not authorized, check client id in settings.');
            }
        })
    }

    generateAuthorizationUrl() {
        return new Promise(async (resolve, reject) => {
            try {
                const payload = {
                    "client_id": this.clientId,
                    "response_type": 'code',
                    "approval_prompt": 'auto',
                    "scope": CONSTANS.Scopes,
                    "redirect_uri": CONSTANS.Url.Redirect
                }
                const params = QueryString.stringify(payload);
                const oauth2URI = `${CONSTANS.Url.oauth2}${params}`;
                resolve(oauth2URI);
            } catch (error) {
                reject(error);
            };
        })
    }

    saveTokens(tokens) {
        return new Promise(async (resolve, reject) => {
            try {
                tokens = JSON.stringify(tokens, null, 2);
                await fsPromises.writeFile(this.tokensFile, tokens);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }

    clearToken() {
        return new Promise(async (resolve, reject) => {
            try {
                const object = JSON.stringify({});
                await fsPromises.writeFile(this.tokensFile, object);
                resolve();
            } catch (error) {
                reject(error);
            };
        })
    }
}
module.exports = AUTHENTICATION;