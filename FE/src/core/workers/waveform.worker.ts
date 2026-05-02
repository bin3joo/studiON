//뷰 컴포넌트에서 워커파일로 넘겨줄 데이터들의 이름과 타입을 정의하는 설께도
//오디오 파형, 색상, 도화지, 1픽셀당 들어가는 오디오 샘플 개수등

interface WorkerMessage {
  channelData: Float32Array;
  color: string;
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  samplesPerPixel: number;    
  startSampleOffset: number;  
}

//메인 스레드에서 worker.postMessage로 던저준 데이터를 받아서 해체한 후 변수에 담는다.
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { channelData, color, canvas, width, height, samplesPerPixel, startSampleOffset } = e.data;

  if (!channelData) return;

  //2d 컨텍스트를 가져온다.이 컨텍스트 객체에 그려라(그리기 명령을 수행할 주체)
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. 도화지 초기화
  ctx.clearRect(0, 0, width, height);

  // 2. 펜 설정 (색상과 두께 지정)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  
  // 3. 선 그리기 시작
  ctx.beginPath();

  //가운데 기준점 캔버스 높이의 절반값을 구해 정중앙 기준선으로 삼는다. Y좌표는 위로 갈수록 숫자가 작고 아래로 갈수록 숫자가 커진다.
  //Y값 보정 공식  
  const centerY = height / 2;

  // 오디오 데이터를 순회하며 픽셀 단위로 최소/최대 높이
  for (let x = 0; x < width; x += 1) {
    const start = Math.floor(startSampleOffset + x * samplesPerPixel);
    const end = Math.floor(startSampleOffset + (x + 1) * samplesPerPixel);
    //계산된 위치가 실제 오디오 데이터 길이보다 길어진면 렌더링을 중단하고 배열의 끝을 넘어 읽지 않도록 끝을 보정함.
    if (start >= channelData.length) break;

    const actualEnd = Math.min(end, channelData.length);
    //가장낮은 음수 갑과 가장 높은 양수를 구해서 수직선의 양끝을 이음    
    let min = 1.0;
    let max = -1.0;

    for (let i = start; i < actualEnd; i += 1) {
      const value = channelData[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    //소리가 완전히 없는무음 구간이더라도 캔버스에서 선이 끊어져 보이지 않게 보정해줌.최소 두께를 화면 전체 높이의 0.2%로 설정하고 
    const minHeightClip = 2.0 / height;
    if (max - min < minHeightClip) {
        max = minHeightClip / 2;
        min = -minHeightClip / 2;
    }
    //브라우저 2D 캔버스는 맨위가 0이고 아래로 갈수록 숫자가 커진다.
    const yTop = centerY - (max * centerY);
    const yBottom = centerY - (min * centerY);

    // X좌표에 맞춰 위에서 아래로 세로선을 쭉 rmtsmsep
    ctx.moveTo(x, yTop);
    ctx.lineTo(x, yBottom);
  }

  // 4. 화면에 출력!
  ctx.stroke();
};