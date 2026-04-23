/** @type {import('tailwindcss').Config} */
//디자인 설명서
export default {
  //다크모드를 어떻게 켤지 설정 -> class를 추가하면 다크모드 적용
  darkMode: ["class"],
  //어떤 파일에 디자인을 적용할지 설정
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  //서비스 전체의 색상 팔레트를 정의
  theme: {
    extend: {
      colors: {
        //색상값을 직벚 적지 않고 변수로 뚤어 놓았다.
        //index.css에 있는 변수값 하나만 바꾸면 서비스 전체 색을 바꿀 수 있다.
        //보더(외각선)
        border: "hsl(var(--border))",
        //인풋(입력창)
        input: "hsl(var(--input))",
        //링(테두리)
        ring: "hsl(var(--ring))",
        //배경
        background: "hsl(var(--background))",
        //글자색
        foreground: "hsl(var(--foreground))",
        //카드
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        //팝업
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        //주요 색상
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        //보조 색상
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        //무채색
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        //강조 색상
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        //파괴 색상
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        //차트 색상
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        //사이드바
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: {
            DEFAULT: "hsl(var(--sidebar-primary))",
            foreground: "hsl(var(--sidebar-primary-foreground))",
          },
          accent: {
            DEFAULT: "hsl(var(--sidebar-accent))",
            foreground: "hsl(var(--sidebar-accent-foreground))",
          },
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      //모든 요소의 기본 모서리 둥글기 설정
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      //ui에니메이션 설정, 아코디언 메뉴
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  //부드러운 에니메이션 플러그인
  plugins: [require("tailwindcss-animate")],
}