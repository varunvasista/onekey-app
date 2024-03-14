import Svg, { SvgProps, Path } from 'react-native-svg';
const SvgThinkingBubble = (props: SvgProps) => (
  <Svg fill="none" viewBox="0 0 24 24" accessibilityRole="image" {...props}>
    <Path
      fill="#000"
      fillRule="evenodd"
      d="M5 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-3 1a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM13 4c-.672 0-1.268.33-1.632.843-.488.686-1.336 1.19-2.266 1.159a3 3 0 0 0-1.891 5.407c.517.385.789.99.789 1.591a2 2 0 0 0 3.34 1.484c.687-.62 1.761-.944 2.736-.629a2.999 2.999 0 0 0 3.53-1.37c.21-.365.514-.669.88-.878a3 3 0 0 0-1.588-5.605c-.93.03-1.778-.473-2.266-1.159A1.996 1.996 0 0 0 13 4Zm-3.262-.316A3.996 3.996 0 0 1 13 2c1.347 0 2.538.667 3.262 1.684.152.214.396.325.57.319L17 4a5 5 0 0 1 2.479 9.343.366.366 0 0 0-.136.136 4.999 4.999 0 0 1-5.882 2.28c-.203-.066-.547-.001-.778.208A4 4 0 0 1 6 13a5 5 0 0 1 3.168-8.998c.174.007.418-.104.57-.318Z"
      clipRule="evenodd"
    />
  </Svg>
);
export default SvgThinkingBubble;