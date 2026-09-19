'use client';

import type {ComponentProps, ReactElement} from 'react';
import {Toaster as Sonner} from 'sonner';

type ToasterProps = ComponentProps<typeof Sonner>;

const Toaster = ({...props}: ToasterProps): ReactElement => {
  return <Sonner className="toaster group" theme="dark" {...props} />;
};

export {Toaster};
