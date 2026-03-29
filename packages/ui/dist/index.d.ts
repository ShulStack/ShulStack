import * as react from 'react';
import { ReactNode } from 'react';

type StackCardProps = {
    children: ReactNode;
    title: string;
};
declare function StackCard({ children, title }: StackCardProps): react.JSX.Element;

export { StackCard };
