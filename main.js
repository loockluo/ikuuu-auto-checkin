import { appendFileSync } from "fs";

const host = process.env.HOST || "ikuuu.win";

const checkInUrl = `https://${host}/user/checkin`;

// 签到
async function checkIn(account) {
  const response = await fetch(checkInUrl, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: {
      Cookie: account.cookie,
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Origin: `https://${host}`,
      Referer: `https://${host}/user`,
    },
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Cookie 已失效或未被站点接受，接口重定向；请重新登录并更新 ACCOUNTS。");
  }

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("签到接口返回 HTML 或其他非 JSON 内容，可能是登录页或站点验证页面。");
  }
  if (!data || typeof data.msg !== "string") {
    throw new Error("签到接口响应格式已变化，缺少结果消息。");
  }
  console.log(`${account.name}: ${data.msg}`);

  return data.msg;
}

// 处理
async function processSingleAccount(account) {

  const checkInResult = await checkIn(account);

  return checkInResult;
}

function setGitHubOutput(name, value) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

// 入口
async function main() {

  let accounts;

  try {
    if (!process.env.ACCOUNTS) {
      throw new Error("❌ 未配置账户信息。");
    }

    accounts = JSON.parse(process.env.ACCOUNTS);
  } catch (error) {
    const message = `❌ ${error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
      }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const allPromises = accounts.map((account) => processSingleAccount(account));
  const results = await Promise.allSettled(allPromises);

  const msgHeader = "\n======== 签到结果 ========\n\n";
  console.log(msgHeader);

  let hasError = false;

  const resultLines = results.map((result, index) => {
    const accountName = accounts[index].name;

    const isSuccess = result.status === "fulfilled";

    if (!isSuccess) {
      hasError = true;
    }

    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;

    const line = `${accountName}: ${icon} ${message}`;

    isSuccess ? console.log(line) : console.error(line);

    return line;
  });

  const resultMsg = resultLines.join("\n");

  setGitHubOutput("result", resultMsg);

  if (hasError) {
    process.exit(1);
  }
}

main();
