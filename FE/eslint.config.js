//품질관리
//자바스크립트 전문
import js from '@eslint/js'
//브라우저 환경 전문(window, document)를 에러처리 하지 않게 적용
import globals from 'globals'
//리액트으로 useEffect, useState등을 사용했을때 에러처리 하지 않게 적용
import reactHooks from 'eslint-plugin-react-hooks'
//바이트 화면 새로고침시 화면이 꺠지지 않게 규칙을 강제
import reactRefresh from 'eslint-plugin-react-refresh'
//타입스크립트 전문
import tseslint from 'typescript-eslint'
//설정
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  //dist 폴더는 에러처리 하지 않음(배포를 위해 코드를 압축한 파일)
  globalIgnores(['dist']),
  {
    //ts,tsx 파일에 대해서만 적용
    files: ['**/*.{ts,tsx}'],
    //권장가읻드를 적용
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    //2020자바스크립트를 사용
    languageOptions: {
      ecmaVersion: 2020,
      //웹브라우저에서 돌아가기 때문에 alert나 console로그에 대해 에ㄹ러를 띄우지 않음
      globals: globals.browser,
    },
  },
])
