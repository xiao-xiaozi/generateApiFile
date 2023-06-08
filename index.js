const fs = require("fs");
const http = require("http");
const _ = require('lodash')

let setting = {
  dir: "test-ApiFile",
  swaggerUrl: "http://172.16.6.42:8532/ticket/v2/api-docs",
  // swaggerUrl:'http://172.16.6.254:9010/userManage/v2/api-docs',
  // 如果swagger配置了访问账号则需要配置 auth
  options: {
    // auth:'user:password'
  },
};

http
  .get(setting.swaggerUrl, setting.options, (res) => {
    const { statusCode } = res;
    const contentType = res.headers["content-type"];

    let error;
    // Any 2xx status code signals a successful response but
    // here we're only checking for 200.
    if (statusCode !== 200) {
      error = new Error("Request Failed.\n" + `Status Code: ${statusCode}`);
    } else if (!/^application\/json/.test(contentType)) {
      error = new Error(
        "Invalid content-type.\n" +
          `Expected application/json but received ${contentType}`
      );
    }
    if (error) {
      console.error(error.message);
      // Consume response data to free up memory
      res.resume();
      return;
    }
    res.setEncoding("utf8");
    let rawData = "";
    res.on("data", (chunk) => {
      rawData += chunk;
    });
    res.on("end", () => {
      try {
        const parsedData = JSON.parse(rawData);
        generateApiFile(parsedData);
      } catch (e) {
        console.error(e.message);
      }
    });
  })
  .on("error", (e) => {
    console.error(`Got error: ${e.message}`);
  });

function generateApiFile(apiDoc) {
  let { paths, definitions, tags } = apiDoc;
  if (!paths) throw new Error("paths field is undefined!");
  if (!definitions) throw new Error("definitions field is undefined!");
  if (!tags) throw new Error("tags field is undefined!");

  // 接口类型/标签/标识
  let tagObj = {};
  tags.forEach((tag) => {
    tagObj[tag.name] = {
      // name: tag.name,
      name: apiFileName(tag.description),
      apiStr: "",
    };
  });

  // 用controller 名作为api文件名
  function apiFileName(name){
    let nameSplit = name.split(' ')
    return nameSplit.slice(0, nameSplit.length - 1).join('')
  }

  // paths 处理
  for (let url in paths) {
    for (let method in paths[url]) {
      let apiInfo = paths[url][method]; // 接口信息
      // apiDescription
      let apiDescription = apiInfo.summary;
      // params 参数
      // let apiParams = paramsFn(apiInfo.parameters, definitions);

      // todo：函数名取接口split('/')后的哪一段
      let urlSplit = url.split("/");
      // tagObj[apiInfo.tags[0]].name = urlSplit[1]; // api js 文件名
      let parametersIn = apiInfo.parameters.map((item) => item.in); // 接口参数位置
      let fnName; // 从接口路径获取api函数名
      let apiUrl;
      if (parametersIn.includes("path")) {
        // 接口参数在请求路径上
        // fnName = urlSplit[urlSplit.length - 2];
        fnName = _.camelCase(urlSplit[urlSplit.length - 3] + ' ' + urlSplit[urlSplit.length - 2])
        let index = url.indexOf("{");
        apiUrl = url.slice(0, index);
        let pathParam = apiInfo.parameters.find((el) => el.in === "path");
        tagObj[apiInfo.tags[0]].apiStr += `
/**
 * @description ${apiDescription}
*/
export function ${fnName}(${pathParam.name}) {
  return request({
    url: '${apiUrl}' + ${pathParam.name},
    method: '${method}',
  })
}
`;
      } else {
        // fnName = urlSplit[urlSplit.length - 1];
        fnName = _.camelCase(urlSplit[urlSplit.length - 2] + ' ' + urlSplit[urlSplit.length - 1]);
        apiUrl = url;
        tagObj[apiInfo.tags[0]].apiStr += `
/**
 * @description ${apiDescription}
*/
export function ${fnName}(${method == "get" ? "params" : "data"}) {
  return request({
    url: '${apiUrl}',
    method: '${method}',
    ${method == "get" ? "params" : "data"}
  })
}
`;
      }
    }
  }

  saveApiFile(tagObj);
}

function saveApiFile(tagObj) {
  let files;
  // 如果有这个文件夹
  if (fs.existsSync(setting.dir)) {
    files = fs.readdirSync(setting.dir);
    files.forEach((file) => {
      const curPath = `${setting.dir}/${file}`;
      if (fs.statSync(curPath).isDirectory()) {
        // 递归删除文件夹
        folderObj.delDir(curPath);
      } else {
        // 删除文件
        fs.unlinkSync(curPath);
      }
    });
  } else {
    fs.mkdirSync(setting.dir);
  }
  for (prop in tagObj) {
    fs.writeFileSync(
      "./" + setting.dir + "/" + tagObj[prop].name + ".js",
      tagObj[prop].apiStr,
      {
        encoding: "utf-8",
      }
    );
  }
}

// for in 遍历 paths 获得请求地址 url
// paths[url] 进行 for in 得到请求类型 method
// paths[url][method]  .summary 接口注释信息 url.split('/')[length-1] 得到函数名字
// definitions 存储着参数信息 可以根据paths[url].method.parameters[0].schema.originalRef 去definitions中获取
