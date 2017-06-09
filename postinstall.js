#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const opts = cwd => ({ stdio: 'inherit', cwd: path.join(__dirname, cwd) });

execSync('yarn link', opts('shared/duk-amqp'));
execSync('yarn link', opts('services/image-transform'));
execSync('yarn link duk-task-queue', opts('services/store'));
execSync('yarn link duk-task-queue', opts('shared/duk-task-queue'));
