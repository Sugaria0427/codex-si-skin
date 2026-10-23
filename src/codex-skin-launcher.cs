using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Windows.Forms;

internal static class CodexSkinLauncher {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr window,int command);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
  delegate bool EnumWindow(IntPtr window,IntPtr data);
  static string Quote(string value){return "\""+value.Replace("\"","\\\"")+"\"";}
  static void Focus(int pid){EnumWindows(delegate(IntPtr window,IntPtr unused){uint owner;GetWindowThreadProcessId(window,out owner);if(owner!=(uint)pid||!IsWindowVisible(window))return true;if(IsIconic(window))ShowWindowAsync(window,9);SetForegroundWindow(window);return false;},IntPtr.Zero);}
  [STAThread] static int Main(string[] args){
    bool quiet=Array.IndexOf(args,"--quiet")>=0,noFocus=Array.IndexOf(args,"--no-focus")>=0;
    try{
      foreach(string argument in args)if(argument!="--reuse-only"&&argument!="--no-focus"&&argument!="--quiet")throw new Exception("不支持的启动参数。");
      string directory=AppDomain.CurrentDomain.BaseDirectory;
      string identity;using(var hash=SHA256.Create())identity=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(directory.ToLowerInvariant()))).Replace("-","");
      using(var mutex=new Mutex(false,"Local\\CodexSkinLauncher_"+identity)){
        bool acquired;try{acquired=mutex.WaitOne(0);}catch(AbandonedMutexException){acquired=true;}if(!acquired)return 0;
        try{
          var serializer=new JavaScriptSerializer();
          var config=serializer.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(directory,"launcher-config.json"),Encoding.UTF8));
          string node=Convert.ToString(config["nodePath"]);
          if(!File.Exists(node))throw new Exception("换肤后台的运行环境已移动。请修复换肤启动器的 Node 路径。");
          string command=Quote(Path.Combine(directory,"launch-skin.mjs"));foreach(string argument in args)command+=" "+argument;
          var info=new ProcessStartInfo(node,command){UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden,WorkingDirectory=directory,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
          using(var child=Process.Start(info)){
            var output=child.StandardOutput.ReadToEndAsync();var errors=child.StandardError.ReadToEndAsync();child.WaitForExit();
            var result=serializer.Deserialize<Dictionary<string,object>>(output.Result);
            if(result==null||!result.ContainsKey("ok")||!Convert.ToBoolean(result["ok"]))throw new Exception(result!=null&&result.ContainsKey("error")?Convert.ToString(result["error"]):"换肤入口启动失败。请检查换肤目录中的启动记录。");
            if(!noFocus)Focus(Convert.ToInt32(result["codexPid"]));
            return 0;
          }
        }finally{mutex.ReleaseMutex();}
      }
    }catch(Exception error){if(!quiet)MessageBox.Show(error.Message,"Codex（祀）",MessageBoxButtons.OK,MessageBoxIcon.Information);return 1;}
  }
}
