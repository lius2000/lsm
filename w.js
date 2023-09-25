import fs from 'fs';
import util from 'util';
import axios from 'axios';
import path from 'path';
import protobufjs from 'protobufjs';
import helper from './helper.js';
import { getSkinName } from '../data/skins.js';

const send = 1;
const gameFile = process.argv[2];
const gameType = process.argv[3] ? 6 : 3;
const game = helper.load(gameFile);

let tokenNum = fs.readdirSync('data').filter(file => file.includes('token')).length;

let headers = [];
for (let i = 1; i <= tokenNum; i++) {
  let token = fs.readFileSync(`data/token${i}.txt`);
  headers.push({
    'b':   '394',
    'Host': 'cat-match.easygame2021.com',
    'Connection': 'keep-alive',
    'xweb_xhr': '1',
    't': token.toString().trim(),
    'user-agent': 'Mozilla/5.0 (Linux; Android 9; MI 9 Build/PQ3A.190705.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36 MicroMessenger/8.0.2.1860(0x28000234) Process/appbrand1 WeChat/arm32 Weixin Android Tablet NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android',
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Referer': 'https://servicewechat.com/wx141bfb9b73c970a9/34/page-frame.html',
    'Accept-Language': 'en-us,en',
    'Accept-Encoding': 'gzip, deflate',
  });
}

function getRandom(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

let matchPlayInfoList = [];
let totalTime = 0;
for (let i = 0; i < headers.length; i++) {
    let stepInfoList = game.stepList.map((e, i) => {
        let time;
        if (e === -4 || e === -1) {
            time = getRandom(30003, 30230);
        } else {
            time = getRandom(800, 1800);
        }
        totalTime += time;
        return {
            chessIndex: e,
            timeTag: e === 0 ? parseInt(game.cards[0].type) : (e > 0 ? parseInt(game.cards[e].type) : e),
            deltaTime: i === 0 ? 0 : time
        };
    });
    let matchPlayInfo = await matchPlayInfoToStr(stepInfoList, gameType);
    let deltaTimeSum = stepInfoList.reduce((sum, step) => sum + step.deltaTime, 0);
    let rankTime = Math.floor((deltaTimeSum - 18000) / 1000); 

    let data = {
        map_seed_2: "",
        play_info: "",
        rank_role: 2,
        rank_score: 1,
        rank_state: 1,
        rank_time: rankTime,
        removed: game.cards.length,
        skin: 1,
        version: "328"
    };
    data.map_seed_2 = game.matchInfo.data.map_seed_2;
    if (gameType == 3) {
        data.play_info = matchPlayInfo;
    }
    // console.log(data);
    matchPlayInfoList.push({ data: data, headers: headers[i] });
    totalTime = 0;
}

console.log("该方块总数:", game.cards.length);

function matchPlayInfoToStr(stepInfoList, gameType) {
    return new Promise((resolve) => {
        protobufjs.load(path.join(process.cwd(), "data", "yang.proto"), (_, root) => {
            const MatchPlayInfo = root.lookupType("yang.MatchPlayInfo");
            const matchPlayInfo = {
                gameType,
                stepInfoList,
            };
            const buf = MatchPlayInfo.encode(matchPlayInfo).finish();
            const b64 = Buffer.from(buf).toString("base64");

            resolve(b64);
        });
    });
}

const url_over = 'https://cat-match.easygame2021.com/sheep/v1/game/game_over_ex?';

const writeFile = util.promisify(fs.writeFile);

if (send) {
    const matchTimestamp = fs.readFileSync('match_timestamp.json', 'utf8');
    const timestamp = JSON.parse(matchTimestamp).timestamp;
    const currentTime = new Date();
    const timestampDiff = Math.floor((currentTime - new Date(timestamp)) / 1000);
    const waitTime = matchPlayInfoList[0].data.rank_time + 26 - timestampDiff;
  
    const sendTime = new Date(Date.now() + waitTime * 1000);
    const sendTimeFormatted = sendTime.toLocaleString();
    console.log(`需等待${waitTime}秒后发送游戏数据`);
    console.log('本次挑战完成时间：', sendTimeFormatted);
  
    setTimeout(() => {
      console.log('--------------------------------------------------------------');
      let req = [];
      let gameMode = gameType == 3 ? '每日挑战' : '羊羊大世界';
  
      for (let i = 0; i < matchPlayInfoList.length; i++) {
        req.push(
          axios.post(url_over, matchPlayInfoList[i].data, { headers: matchPlayInfoList[i].headers })
            .then(res => {
              let data = matchPlayInfoList[i].data;
              let result = {
                t: matchPlayInfoList[i].headers.t,
                request_data: data,
                response_data: res.data,
                time: new Date().toLocaleString()
              };
              writeFile('data.txt', JSON.stringify(result) + '\n---------------------------------------------\n\n', { flag: 'a' });
  
              // 获取uid对应的token
              const meData = fs.readFileSync('./data/me', 'utf8');
              const lines = meData.split('\n');
              const tokenDataMap = {};
              for (let line of lines) {
                if (line.trim() !== '') {
                  const jsonData = JSON.parse(line);
                  const token = jsonData.token;
                  tokenDataMap[token] = jsonData.data;
                }
              }
              const requestToken = matchPlayInfoList[i].headers.t;
              const data2 = tokenDataMap[requestToken];
              const uid = data2.uid;
              const nickName = data2.nick_name;
  
              console.log(`${i + 1} 昵称: ${nickName}`, `UID: ${uid}`, `返回信息: ${res.data.err_code === 0 ? '已过关' : res.data.err_code}, 皮肤id: ${res.data.data.skin_id}, 皮肤名称: ${getSkinName(res.data.data.skin_id)}`);
            })
        );
      }
      Promise.all(req).then(() => {
        console.log('--------------------------------------------------------------');
        console.log('当前游戏模式', gameMode);
      });
    }, waitTime * 1000);
}
