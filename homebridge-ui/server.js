const {
  HomebridgePluginUiServer,
  RequestError
} = require('@homebridge/plugin-ui-utils');
const XboxWebApi = require('xbox-webapi');

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    // super() MUST be called first
    super();

    this.data = {};
    // handle request for the /data route
    this.onRequest('/data', this.getData.bind(this));

    // this MUST be called when you are ready to accept requests
    this.ready();
  }

  async getData(payload) {
    console.log('Incomming token %s:, host: %s, clientId: %s.', payload.token, payload.host, payload.clientId);

    try {
      const token = payload.token;
      const host = payload.host;
      const clientId = payload.clientId;
      const clientSecret = payload.clientSecret;
      const authTokenFile = `${this.homebridgeStoragePath}/xboxTv/authToken_${host.split('.').join('')}`;

      const webApiCheck = XboxWebApi({
        clientId: clientId,
        clientSecret: clientSecret,
        userToken: '',
        uhs: ''
      });

      try {
        webApiCheck._authentication._tokensFile = authTokenFile;
        const isAuthenticated = await webApiCheck.isAuthenticated();
        this.data = {
          res: 'Console already authenticated',
          status: 0
        }
      } catch (error) {
        if (token != undefined) {
          const oauth2URI = webApiCheck._authentication.generateAuthorizationUrl();
          this.data = {
            res: oauth2URI,
            status: 1
          }
          try {
            const authenticationData = await webApiCheck._authentication.getTokenRequest(token);
            webApiCheck._authentication._tokens.oauth = authenticationData;
            webApiCheck._authentication.saveTokens();
            this.data = {
              res: 'Console successfully authenticated and *autToken* file saved',
              status: 3
            }
          } catch (error) {
            this.data = {
              res: 'Authorization and Token file save error.',
              status: 4
            }
          };
        } else {
          this.data = {
            res: 'Authorization link empty, check *authToken* file.',
            status: 2
          }
        }
      };

      return this.data;
    } catch (e) {
      throw new RequestError('Failed to return data try again.', {
        message: e.message
      });
    }
  }
}

(() => {
  return new PluginUiServer();
})();