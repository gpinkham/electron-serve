'use strict';
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const electron = require('electron');

const stat = promisify(fs.stat);

const getPath = async path_ => {
    try {
        const result = await stat(path_);

        if (result.isFile()) {
            return path_;
        }

        if (result.isDirectory()) {
            return getPath(path.join(path_, 'index.html'));
        }
    } catch (_) {}
};

module.exports = options => {
    options = Object.assign({
        scheme: 'app'
    }, options);

    // TODO: Make directory relative to app root. Document it.
    if (!options.directory) {
        throw new Error('The `directory` option is required');
    }

    var baseElectron;
    if (electron.app) {
        baseElectron = electron;
    } else {
        baseElectron = electron.remote;
    }

    options.directory = path.resolve(baseElectron.app.getAppPath(), options.directory);

    const handler = async(request, callback) => {
        const indexPath = path.join(options.directory, 'index.html');
        const filePath = path.join(options.directory, decodeURIComponent(new URL(request.url).pathname));

        callback({
            path: (await getPath(filePath)) || indexPath
        });
    };

    if (baseElectron.protocol.registerStandardSchemes) {
        // Electron <=4
        baseElectron.protocol.registerStandardSchemes([options.scheme], { secure: true });
    } else {
        // Electron >=5
        baseElectron.protocol.registerSchemesAsPrivileged([{
            scheme: options.scheme,
            privileges: {
                secure: true,
                standard: true
            }
        }]);
    }

    (async() => {
        await baseElectron.app.whenReady();

        const session = options.partition ?
            baseElectron.session.fromPartition(options.partition) :
            baseElectron.session.defaultSession;

        session.protocol.registerFileProtocol(options.scheme, handler, error => {
            if (error) {
                throw error;
            }
        });
    })();

    return async win => {
        await win.loadURL(`${options.scheme}://-`);
    };
};