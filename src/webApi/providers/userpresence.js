const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://userpresence.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = 3
    
    provider.getCurrentUser = () => {
        return provider.get('/users/me?level=all')
    }

    return provider
}