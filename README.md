# Duocun

Duocun is a food delivery website

# Dependencies

Nodejs 
Mongodb

# Install

git clone project

cd to project root folder /, (remove package-lock.json), then run `npm install` for server

cd to /client folder, (remove package-lock.json), then run `npm install` for client


## Config
copy duocun.cfg.json file to the parent folder of root /

## Run

### Run Server

cd to project root folder /,  and run `npm run build`

then `npm run start` or open Visual Studio Code and hit Debug menu.

### API

### API to client

`Accounts/current?tokenId={tokenId}`
Method: get
Bearer: []
params: tokenId string
description: token id of current user
required: true
response: {...IAccount}