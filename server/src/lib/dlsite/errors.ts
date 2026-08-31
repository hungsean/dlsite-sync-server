// DLsite 認證相關的型別化錯誤

// 帳號或密碼錯誤 (對應 DLsite 回傳的日文訊息)
export class InvalidCredentialsError extends Error {
  constructor(message = 'DLsite 帳號或密碼錯誤') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

// 登入流程發生非預期狀況 (例如拿不到 XSRF token, redirect 異常)
export class LoginFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginFlowError';
  }
}
