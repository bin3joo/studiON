type EventHandler = (data: any) => void;

class SocketService {
  // 🌟 핵심: 현재 백엔드가 없으므로 true로 설정하여 가짜 통신 활성화
  public isMockMode = true; 
  
  // 이벤트 타입별로 실행할 콜백 함수들을 모아두는 보관함
  private listeners: Map<string, EventHandler[]> = new Map();

  // 1. 웹소켓 연결
  connect(projectId: number) {
    if (this.isMockMode) {
      // [가짜 마우스 움직임 시뮬레이션]
      let fakeX = 500;
      let fakeY = 300;
      setInterval(() => {
        fakeX += (Math.random() - 0.5) * 50; // 랜덤하게 움직임
        fakeY += (Math.random() - 0.5) * 50;
        
        this.simulateIncomingEvent('CURSOR_MOVE', {
          userId: 'user_999',
          nickname: '협업자_버블',
          color: '#FF3DCB',
          x: fakeX,
          y: fakeY
        });
      }, 100); // 0.1초마다 움직임
      console.log(`[Socket Mock] 🟢 프로젝트 ${projectId} 가상 웹소켓 연결 성공!`);
      // 가상의 다른 사용자가 접속해 있는 상황 시뮬레이션
      setTimeout(() => {
        this.simulateIncomingEvent('MEMBER_JOINED', {
          joinedUser: { userId: 2, nickname: "협업자_버블" },
          currentMembers: [
            { userId: 1, nickname: "나" },
            { userId: 2, nickname: "협업자_버블" }
          ]
        });
      }, 1000);
      return;
    }

    // 나중에 실제 연동 시 여기에 SockJS + STOMP 클라이언트 생성 및 connect 로직 작성
    // const socket = new SockJS('https://api.yourdomain.com/ws');
    // this.stompClient = Stomp.over(socket);
    // this.stompClient.connect({...});
  }

  // 2. 서버 구독 (이벤트 수신 대기)
  subscribe(eventType: string, callback: EventHandler) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)?.push(callback);
    
    if (!this.isMockMode) {
        // 실제 STOMP subscribe 로직...
        // this.stompClient.subscribe(`/topic/projects/${projectId}/${eventType}`, (msg) => callback(JSON.parse(msg.body)));
    }
  }

  // 3. 서버로 데이터 발행 (전송)
  publish(eventType: string, payload: any) {
    if (this.isMockMode) {
      console.log(`[Socket Mock] 📤 서버로 전송됨 [${eventType}]:`, payload);

      // 가짜 서버 딜레이(0.5초) 후, 백엔드가 모두에게 뿌려준 것처럼 수신 흉내
      setTimeout(() => {
        this.simulateIncomingEvent(eventType, payload);
      }, 500);
      return;
    }

    // 실제 전송 로직
    // this.stompClient.send(`/app/projects/${projectId}/${eventType}`, {}, JSON.stringify(payload));
  }

  // 연결 해제
  disconnect() {
    console.log('[Socket Mock] 🔴 웹소켓 연결 해제됨');
    this.listeners.clear();
    // 실제 연결 해제 로직...
  }

  // --- [테스트 전용 헬퍼 함수] ---
  // 프론트엔드에서 강제로 '서버에서 알림이 온 것처럼' 이벤트를 쏴주는 함수
  public simulateIncomingEvent(eventType: string, payload: any) {
    console.log(`[Socket Mock] 📥 서버에서 수신됨 [${eventType}]:`, payload);
    const callbacks = this.listeners.get(eventType) || [];
    callbacks.forEach(cb => cb(payload)); 
  }
}

// 싱글톤으로 export (어디서 임포트하든 똑같은 객체를 사용함)
export const socketService = new SocketService();