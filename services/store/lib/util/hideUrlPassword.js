function hideUrlPassword(url) {
    if (typeof url !== 'string') {
        throw new TypeError(`URL must be a string: ${url}`);
    }
    return url.replace(/:[^/](.+)?@/, ':*****@').replace(/(password=).+(&?)/, '$1*****$2');
}

module.exports = hideUrlPassword;
