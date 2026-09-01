'use client';

import React from 'react';
import { FeaturesModal, FeaturesModalProps, FeatureItem, defaultFeaturesList } from './FeaturesModal';

export type MoreMenuDrawerProps = FeaturesModalProps;

export const MoreMenuDrawer: React.FC<MoreMenuDrawerProps> = (props) => {
  return <FeaturesModal {...props} />;
};

export { defaultFeaturesList };
export type { FeatureItem };
export default MoreMenuDrawer;
