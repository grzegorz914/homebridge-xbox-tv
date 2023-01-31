'use strict';
const QueryString = require('querystring')
const HttpClient = require('./httpclient.js')
const fs = require('fs')

class AUTHENTICATION {
    constructor(config) {
        this.httpClient = new HttpClient();
        this.clientId = config.clientId;
        this.clientSecret = config.secret;
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
                    "redirect_uri": this.getReturnUrl()
                }
                const params = QueryString.stringify(paramsObject)
                const oauth2URI = 'https://login.live.com/oauth20_authorize.srf?' + params
                resolve(oauth2URI);
            } catch (error) {
                reject(error);
            };
        })
    }

    refreshTokens(type) {
        return new Promise((resolve, reject) => {
            if (type === undefined) {
                type = 'oauth'
            }

            switch (type) {
                case 'oauth':
                    if (this.tokens.oauth.refresh_token) {
                        this.refreshTokens('user').then(() => {
                            resolve()
                        }).catch((error) => {
                            reject(error)
                        })
                    } else {
                        reject('No oauth token found. Use authorization manager first.')
                    }
                    break;
                case 'user':
                    if (this.tokens.user.Token) {
                        const userexpireuser = new Date(this.tokens.user.NotAfter).getTime()
                        if (new Date() > userexpireuser) {
                            // Oauth token expired, refresh user token
                            this.refreshToken(this.tokens.oauth.refresh_token).then(async (usertoken) => {
                                this.tokens.oauth = usertoken
                                await this.saveTokens()

                                this.getUserToken(this.tokens.oauth.access_token).then(async (token) => {
                                    this.tokens.user = token
                                    this.tokens.xsts = {}
                                    await this.saveTokens()

                                    this.refreshTokens('xsts').then(() => {
                                        resolve()
                                    }).catch((error) => {
                                        reject(error)
                                    })
                                }).catch((error) => {
                                    reject(`Refresh oauth access token error: ${error}`)
                                })
                            }).catch((error) => {
                                reject(`Refresh user access token error: ${error}`)
                            })
                        } else {
                            this.refreshTokens('xsts').then(() => {
                                resolve()
                            }).catch((error) => {
                                reject(error)
                            })
                        }
                    } else {
                        // Get user token
                        this.getUserToken(this.tokens.oauth.access_token).then(async (data) => {
                            // Got user token, continue with xsts
                            this.tokens.user = data
                            this.tokens.xsts = {}
                            await this.saveTokens()

                            this.refreshTokens('xsts').then(() => {
                                resolve()
                            }).catch((error) => {
                                reject(error)
                            })

                        }).catch((error) => {
                            reject(error)
                        })
                    }
                    break;
                case 'xsts':
                    if (this.tokens.xsts.Token) {
                        const oauthexpire = new Date(this.tokens.xsts.NotAfter).getTime()
                        if (new Date() > oauthexpire) {
                            // Oauth token expired, refresh xstx token
                            this.getXstsToken(this.tokens.user.Token).then(async (token) => {
                                this.tokens.xsts = token
                                await this.saveTokens()

                                this.refreshTokens('xsts').then(() => {
                                    resolve()
                                }).catch((error) => {
                                    reject(error)
                                })

                            }).catch((error) => {
                                // @TODO: Investigate this part of the auth flow
                                reject(`Refresh xsts access token error: ${error}. Use authorization manager again.`)
                            })
                        } else {
                            this.user = {
                                gamertag: this.tokens.xsts.DisplayClaims.xui[0].gtg,
                                xid: this.tokens.xsts.DisplayClaims.xui[0].xid,
                                uhs: this.tokens.xsts.DisplayClaims.xui[0].uhs
                                //agg: data.DisplayClaims.xui[0].agg,
                                //usr: data.DisplayClaims.xui[0].usr,
                                //utr: data.DisplayClaims.xui[0].utr,
                                //prv: data.DisplayClaims.xui[0].prv
                            }
                            resolve()
                        }
                    } else {
                        // Get user token
                        this.getXstsToken(this.tokens.user.Token).then(async (data) => {
                            // Got user token, continue with xsts
                            this.tokens.xsts = data
                            await this.saveTokens()

                            this.user = {
                                gamertag: data.DisplayClaims.xui[0].gtg,
                                xid: data.DisplayClaims.xui[0].xid,
                                uhs: data.DisplayClaims.xui[0].uhs
                                //agg: data.DisplayClaims.xui[0].agg,
                                //usr: data.DisplayClaims.xui[0].usr,
                                //utr: data.DisplayClaims.xui[0].utr,
                                //prv: data.DisplayClaims.xui[0].prv
                            }
                            resolve()
                        }).catch((error) => {
                            reject(error)
                        })
                    }
                    break;
            }
        })
    }

    getTokenRequest(code) {
        return new Promise((resolve, reject) => {
            const tokenParams = {
                "client_id": this.clientId,
                "grant_type": "authorization_code",
                "scope": this.scopes.join(' '),
                "code": code,
                "redirect_uri": this.getReturnUrl()
            }

            if (this.clientSecret !== '') {
                tokenParams.client_secret = this.clientSecret;
            }

            const postData = QueryString.stringify(tokenParams)
            this.httpClient.post(this.endpoints.live + '/oauth20_token.srf', { 'Content-Type': 'application/x-www-form-urlencoded' }, postData).then((data) => {
                const responseData = JSON.parse(data)
                responseData.issued = new Date().toISOString()
                resolve(responseData)
            }).catch((error) => {
                reject(error)
            })
        })
    }

    refreshToken(refreshToken) {
        return new Promise((resolve, reject) => {
            const tokenParams = {
                "client_id": this.clientId,
                "grant_type": "refresh_token",
                "scope": this.scopes.join(' '),
                "refresh_token": refreshToken,
            }

            if (this.clientSecret !== '') {
                tokenParams.client_secret = this.clientSecret;
            }

            const postData = QueryString.stringify(tokenParams)
            this.httpClient.post(this.endpoints.live + '/oauth20_token.srf', { 'Content-Type': 'application/x-www-form-urlencoded' }, postData).then((data) => {
                const responseData = JSON.parse(data)
                responseData.issued = new Date().toISOString()
                resolve(responseData)
            }).catch((error) => {
                reject(error)
            })
        })
    }

    getUserToken(accessToken) {
        return new Promise((resolve, reject) => {
            const tokenParams = {
                "RelyingParty": "http://auth.xboxlive.com",
                "TokenType": "JWT",
                "Properties": {
                    "AuthMethod": "RPS",
                    "SiteName": "user.auth.xboxlive.com",
                    "RpsTicket": "d=" + accessToken
                },
            }

            const postData = JSON.stringify(tokenParams)
            this.httpClient.post(this.endpoints.auth + '/user/authenticate', { 'Content-Type': 'application/json' }, postData).then((data) => {
                const responseData = JSON.parse(data)
                resolve(responseData)
            }).catch((error) => {
                reject(error)
            })
        })
    }

    getXstsToken(userToken) {
        return new Promise((resolve, reject) => {
            const tokenParams = {
                "RelyingParty": "http://xboxlive.com",
                "TokenType": "JWT",
                "Properties": {
                    "UserTokens": [userToken],
                    "SandboxId": "RETAIL",
                },
            }

            const postData = JSON.stringify(tokenParams)
            this.httpClient.post(this.endpoints.xsts + '/xsts/authorize', { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' }, postData).then((data) => {
                const responseData = JSON.parse(data)
                resolve(responseData)
            }).catch((error) => {
                reject(error)
            })
        })
    }

    isAuthenticated() {
        return new Promise(async (resolve, reject) => {
            if (fs.existsSync(this.tokensFile)) {
                await this.loadTokens();
            }

            if (this.clientId !== '') {
                this.refreshTokens().then(() => {
                    resolve()
                }).catch((error) => {
                    reject(error)
                })
            } else if (this.userToken !== '' && this.uhs !== '') {
                resolve()
            } else {
                reject({ error: 'Not authorized.' })
            }
        })
    }

    saveTokens() {
        return new Promise(async (resolve, reject) => {
            try {
                const tokens = JSON.stringify(this.tokens);
                fs.writeFileSync(this.tokensFile, tokens)
                await this.isAuthenticated()
                resolve()
            } catch (error) {
                reject(error);
            };
        })
    }

    loadTokens() {
        return new Promise((resolve, reject) => {
            try {
                const tokens = fs.readFileSync(this.tokensFile).length > 0 ? fs.readFileSync(this.tokensFile).toString() : false;
                this.tokens = tokens ? JSON.parse(tokens) : this.tokens;
                resolve()
            } catch (error) {
                reject(error);
            };
        })
    }

    getReturnUrl() {
        return `http://localhost:8581/auth/callback`
    }

}
module.exports = AUTHENTICATION;