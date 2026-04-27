//프론트의 모든 api요청을 배달.
import axios from 'axios';


//1. 기본 설정이 적용된 axios instance 생성
export const axiosInstance = axios.create({
    //Vite 환경 변수로 API 주소를 설정하거나, 백엔드 주소를 직접 입력
    baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8080",
    timeout: 10000, //10초 이상이 없으면 에러 처리
});

//2. 요청 가로채기(Request Interceptor)
//모든 요청이 나가기 전에 헤더에 토큰을 자동으로 추가
axiosInstance.interceptors.request.use((config) => {
    //JWT 토큰을 로컬스토리지에서 가져와서 헤더에 추가
    const token = localStorage.getItem('accessToken');
    //토큰이 있다면, 모든 헤더에 자동으로 신분증 넣기
    if (token) {
        //명세서에 맞게 'Bearer {token} 형태로 넣는다.
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    //요청 전 에러 처리
    return Promise.reject(error);
});

//3. 응답 가로채기(Response Interceptor)
//백엔드에서 온 응답을 보내기 전에 가로채서 검증
axiosInstance.interceptors.response.use((response) => {
    //response.data에서 isSuccess가 false이면 에러 처리
    if (!response.data.isSuccess) {
        const error = new Error(response.data.errorMessage);
        //개발자가 에러를 잡을 수 있도록 
        (error as any).code = response.data.errorCode;
        throw error;
    }
    //정답 응답일 경우 데이터를 주기
    return response;
}, (error) => {
    if (error.response) {
        //백엔드가 보낸 에러 메시지를 그대로 사용
        error.message = error.response.data?.errorMessage || error.message;
    }
    throw error;
    return Promise.reject(error);
});
