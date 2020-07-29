# duocun-api

duocun-api is a delivery service server

# Dependencies
Nodejs
  You need to install node.js version 10.16.3 on your local machine. You can use nvm to install nodejs on your mac:
  `brew install nvm`
  `nvm install 10.16.3`
  If you don't have nvm, try:
    `brew update`
    `brew install nvm`
    `mkdir ~/.nvm`

  after in your ~/.zshrc or in .bash_profile if your use bash shell: 

    `export NVM_DIR=~/.nvm`
    `source $(brew --prefix nvm)/nvm.sh`
    
Express
Mongodb

# Install

git clone project

cd to the project folder duocun-api, (remove package-lock.json), then run `npm install`


## Config
copy duocun.cfg.json file to the parent folder of the folder duocun-api

## Build
Open a terminal, cd to duocun-api/, for production build, run `npm run build`


## Run

### Run Server

Open a terminal, cd to duocun-api/, run `npm run start` or open Visual Studio Code and hit Debug menu.


### Service API

To be done


