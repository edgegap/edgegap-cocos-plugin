// The parts of the Cocos Creator 3.8 editor API this extension uses (the editor provides the global `Editor`).
declare namespace Editor {
    namespace Panel {
        function define(options: any): any;
        function open(name: string, ...args: any[]): Promise<any>;
    }
    namespace Profile {
        function getConfig(pkg: string, key: string, type?: 'default' | 'global' | 'local'): Promise<any>;
        function setConfig(pkg: string, key: string, value: any, type?: 'default' | 'global' | 'local'): Promise<void>;
        function getProject(pkg: string, key: string, type?: 'default' | 'project'): Promise<any>;
        function setProject(pkg: string, key: string, value: any, type?: 'default' | 'project'): Promise<void>;
    }
    namespace Project {
        const path: string;
        const name: string;
    }
}
