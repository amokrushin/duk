#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const opts = cwd => ({ stdio: 'inherit', cwd: path.join(__dirname, cwd) });

if (process.env.NODE_ENV !== 'production' && !process.env.TRAVIS) {
    execSync('yarn', opts('services/image-transform'));
    execSync('yarn', opts('services/store'));
    execSync('yarn', opts('services/uploads'));
    execSync('yarn', opts('shared/duk-task-queue'));
    execSync('yarn link', opts('shared/duk-task-queue'));
    execSync('yarn link duk-task-queue', opts('services/store'));
    execSync('yarn link duk-task-queue', opts('shared/duk-task-queue'));
}
