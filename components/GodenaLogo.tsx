import React from 'react';
import { Image, StyleProp, ViewStyle } from 'react-native';
import { SvgProps, SvgUri } from 'react-native-svg';
import LogoSource from '../assets/godena-logo.svg';

type Props = {
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
};

export default function GodenaLogo({ width, height, style }: Props) {
  const source = LogoSource as unknown;

  // Some Metro setups still load .svg as an asset id (number) instead of a React component.
  if (typeof source === 'number') {
    const resolved = Image.resolveAssetSource(source);
    if (!resolved?.uri) return null;
    return <SvgUri uri={resolved.uri} width={width} height={height} style={style} />;
  }

  const SvgComponent = source as React.ComponentType<SvgProps>;
  return <SvgComponent width={width} height={height} style={style} />;
}
