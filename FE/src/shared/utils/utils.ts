//프론트엔드 디자인 조립 책임 cn함수를 통해 버튼과 디자인 유지
//clsx는 조건에 따라 클래스를 쉽게 붙였다 뗐다 하는 기능(clsx("버튼기본"), isError && "빨간색", isSuccess && "파란색")
import { clsx, type ClassValue } from "clsx"
//twMerge는 중복되거나 충돌하는 테일윈드 클래스를 정리해주는 기능
import { twMerge } from "tailwind-merge"
//개발자가 던진 복잡한 조건을 clsx에 먽저 넣어서 처리 -> tmMerge에 넣어서 디자인 충돌을 정리
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

//<div className={`px-4 py-2 rounded-md ${isPrimary ? 'bg-blue-500 text-white' : 'bg-gray-200'} ${props.className ? props.className : ''}`}>
//<div className={cn("px-4 py-2 rounded-md bg-gray-200", isPrimary && "bg-blue-500 text-white", props.className)}>
//위의 두 코드는 같은 기능을 하지만 아래 코드가 더 간결하고 가독성이 좋다