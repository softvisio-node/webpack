module.exports = async function ( buffer, map, meta ) {
    const callback = this.async(),
        options = this.getOptions();

    if ( this.cacheable ) this.cacheable();

    const poFile = new options.PoFile( buffer ),
        locale = poFile.toLocale( poFile.language ).toJson();

    delete locale.id;

    callback( null, `export default ${JSON.stringify( locale )}`, map, meta );
};
