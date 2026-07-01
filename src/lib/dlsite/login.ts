import fetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const fetchWithCookies = fetchCookie(fetch, jar);

const commonHeader = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "zh-TW,zh-Hant;q=0.9",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15"
}

async function getXsrfToken() {
    const getTokenResponse = await fetchWithCookies("https://login.dlsite.com/login?user=self", {
        method: "GET",
        headers: commonHeader
    })
    console.log("getTokenResponse:", getTokenResponse);

    const loginDlsiteCookies = await jar.getCookies("https://login.dlsite.com/");
    const xsrfToken = loginDlsiteCookies.find((c) => c.key === 'XSRF-TOKEN')
    return xsrfToken?.value;
}

async function login(loginId: string, password: string, token: string) {
    const loginParams = new URLSearchParams();
    loginParams.append("login_id", loginId);
    loginParams.append("password", password);
    loginParams.append("_token", token);
    const loginResponse = await fetchWithCookies("https://login.dlsite.com/login", {
        method: "POST",
        headers: commonHeader,
        body: loginParams
    })
    console.log("loginResponse:", loginResponse);
}

async function loginSkipRegister() {
    const getLoginSkipRegisterResponse = await fetchWithCookies("https://www.dlsite.com/home/login/=/skip_register/1", {
        method: "GET",
        headers: commonHeader
    })
    console.log("getLoginSkipRegisterResponse:", getLoginSkipRegisterResponse);
}

async function loginFinish() {
    const getLoginFinishResponse = await fetchWithCookies("https://www.dlsite.com/home/login/finish", {
        method: "GET",
        headers: {
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "zh-TW,zh-Hant;q=0.9",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15"
        }
    })
    console.log("getLoginFinishResponse:", getLoginFinishResponse);
}

async function getContentCount() {
    const getContentCountResponse = await fetchWithCookies("https://play.dlsite.com/api/v3/content/count", {
        method: "GET",
        headers: commonHeader
    })
    console.log("getContentCountResponse:", getContentCountResponse);
    return getContentCountResponse.json();
}

export async function loginByPassword(loginId: string, password: string) {
    const xsrfToken = await getXsrfToken()
    if (!xsrfToken) {
        throw new Error("XSRF-TOKEN null or undefined")
    };
    await login(loginId, password, xsrfToken); 

    await loginSkipRegister();
    await loginFinish();

    const serialized = await jar.serialize();
    console.log(JSON.stringify(serialized, null, 2));

}

export async function loginStatus() {
    const response = await getContentCount();
    console.log("response:", response);
    return response;
}